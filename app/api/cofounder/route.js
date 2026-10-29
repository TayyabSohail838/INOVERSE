// POST /api/cofounder  { message, history?: [{role, text}], lang?: "en" | "ur" }
// → { skill, say, details, gapCheck?, gapCheckId?, experimentId?, action? }
//   say     = short line the voice reads aloud
//   details = full answer shown on screen
import { gemma } from "@/lib/gemma";
import { routerPrompt, parseRouterReply, buildSystemPrompt } from "@/lib/skills";
import { runGapCheck } from "@/lib/gapCheck";
import { detectOpenIntent, openReply } from "@/lib/openIntent";
import { buildContext } from "@/lib/context";
import { saveMessages, saveGapCheck, InputError } from "@/lib/store";
import { route, readJson } from "@/lib/http";

// The gap check makes 8 Gemma calls; give it time on Vercel.
export const maxDuration = 60;

const VOICE_RULES = (lang) => `
# HOW TO REPLY
You are talking out loud with the founder, like a cofounder across the table. Reply with ONLY this JSON:
{"say": "what you say out loud: 2-4 natural spoken sentences. Answer directly, give your honest view and the main reason. If it helps the discussion, end with one short question back to the founder. Plain words only: no markdown, no lists, no symbols, no headings.",
 "details": "the full answer in markdown for the screen"}
${lang === "ur" ? 'Write "say" in simple Roman Urdu. Write "details" in English.' : ""}`;

export const POST = route(async (req) => {
  const { message, history = [], lang = "en" } = await readJson(req);
  if (typeof message !== "string" || !message.trim()) throw new InputError("message is required");
  const msg = message.trim().slice(0, 4000);
  const hist = Array.isArray(history) ? history.slice(-8) : [];

  // "Open YouTube", "search for X", "WhatsApp kholo": instant, no Gemma call, not saved
  const open = detectOpenIntent(msg);
  if (open) {
    const say = openReply(open, lang);
    return Response.json({
      skill: "open-website",
      say,
      details: `${say}\n${open.url}`,
      action: { type: "open_url", url: open.url, label: open.label },
    });
  }

  const context = await buildContext();
  const { skill } = parseRouterReply(await gemma(routerPrompt(msg), { temperature: 0, fast: true }));

  let reply;
  if (skill === "roast") {
    // The gap check before building anything; result + its 48-hour test are stored
    const result = await runGapCheck({ idea: msg, context, lang });
    const ids = await saveGapCheck(msg, result);
    reply = { skill, ...result, ...ids };
  } else {
    const system = (await buildSystemPrompt(skill, context)) + VOICE_RULES(lang);
    let out;
    try {
      out = await gemma(msg, { system, history: hist, json: true, fast: true });
    } catch {
      // Model ignored the JSON format: speak the first sentence, show everything
      const t = await gemma(msg, { system, history: hist, fast: true });
      out = { say: t.split(/(?<=[.!?])\s/)[0], details: t };
    }
    reply = { skill, say: out.say || "", details: out.details || out.say || "" };
  }

  // Saving the chat must never cost the founder the answer.
  await saveMessages([
    { role: "user", text: msg },
    { role: "assistant", text: reply.details || reply.say, skill },
  ]).catch((err) => console.warn("Couldn't save the conversation:", err.message));
  return Response.json(reply);
});
