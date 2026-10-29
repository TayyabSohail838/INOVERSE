// POST /api/cofounder  { message, history?: [{role, text}], lang?: "en" | "ur" }
// → { skill, say, details, gapCheck?, gapCheckId?, experimentId?, action? }
//   say     = short line the voice reads aloud
//   details = full answer shown on screen
import { after } from "next/server";
import { gemma } from "@/lib/gemma";
import { routerPrompt, parseRouterReply, buildSystemPrompt } from "@/lib/skills";
import { runGapCheck } from "@/lib/gapCheck";
import { detectOpenIntent, openReply } from "@/lib/openIntent";
import { buildContext } from "@/lib/context";
import { saveMessages, saveGapCheck, InputError } from "@/lib/store";
import { route, readJson } from "@/lib/http";
import { detectEmailIntent, emailBrief } from "@/lib/emailBrief";
import { isDemo } from "@/lib/demo";
import { simulateForChat, detectSimIntent } from "@/lib/simulate";
import { roleForSkill, roleIntro } from "@/lib/roles";

// Every answer says out loud which executive is speaking ("CFO here. ...") and carries
// that role, so the screen can tag it and colour the globe.
function announce(reply, lang) {
  const role = roleForSkill(reply.skill) || "cofounder";
  const intro = roleIntro(reply.skill, lang);
  const say = reply.say && !reply.say.startsWith(intro) ? `${intro} ${reply.say}` : reply.say || intro;
  return { ...reply, role, say };
}

// Sometimes the model puts its whole JSON reply inside "say" (or "details") as text.
// Pull the real say/details back out so the voice never reads JSON aloud.
function unwrap(out) {
  for (let i = 0; i < 2; i++) {
    // JSON, possibly inside a ```json fence
    const inner = [out?.say, out?.details].find((v) => typeof v === "string" && /^\s*(```\w*\s*)?\{[\s\S]*"say"\s*:/.test(v));
    if (!inner) break;
    try {
      const parsed = JSON.parse(inner.slice(inner.indexOf("{"), inner.lastIndexOf("}") + 1));
      out = { say: parsed.say || "", details: parsed.details || parsed.say || "" };
    } catch {
      // half-broken JSON: take the text of "say" and "details" by pattern
      const field = (k) => inner.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];
      const unescape = (s) => s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const rawSay = field("say");
      if (!rawSay) break;
      const say = unescape(rawSay).replace(/\s*\n\s*/g, " ");
      const rawDetails = field("details");
      const details = rawDetails ? unescape(rawDetails) : out.details && out.details !== inner ? out.details : say;
      out = { say, details };
    }
  }
  return out;
}

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
    return Response.json(
      announce(
        {
          skill: "open-website",
          say,
          details: `${say}\n${open.url}`,
          action: { type: "open_url", url: open.url, label: open.label },
        },
        lang
      )
    );
  }

  // "Tell me about my latest email": read the inbox only when asked (sample emails on the public demo)
  if (detectEmailIntent(msg)) return Response.json(announce({ skill: "email", ...(await emailBrief({ lang })) }, lang));

  // Load the company context while the router picks a skill, instead of one after the other.
  const contextP = buildContext();
  contextP.catch(() => {}); // the simulation doesn't need it; errors surface where it's awaited
  const { skill } = detectSimIntent(msg)
    ? { skill: "market-sim" }
    : // picking the advisor is a nice-to-have: if it's slow or busy, the all-round cofounder answers
      parseRouterReply(
        await gemma(routerPrompt(msg), { temperature: 0, fast: true, timeoutMs: 10000, attempts: 1 }).catch(() => "")
      );

  let reply;
  if (skill === "market-sim") {
    // MiroFish-style market simulation: one product, or every product ranked
    reply = await simulateForChat({ message: msg, lang });
  } else if (skill === "roast") {
    // The gap check before building anything; result + its 48-hour test are stored
    const result = await runGapCheck({ idea: msg, context: await contextP, lang });
    const ids = await saveGapCheck(msg, result);
    reply = { skill, ...result, ...ids };
  } else {
    const system = (await buildSystemPrompt(skill, await contextP)) + VOICE_RULES(lang);
    let out;
    try {
      out = await gemma(msg, { system, history: hist, json: true, fast: true });
    } catch (err) {
      if (err.busy) throw err; // Google is overloaded: asking again would only run past the time limit
      // Model ignored the JSON format: speak the first sentence, show everything.
      // If it sent broken JSON instead, hand the whole text to unwrap() below.
      const t = await gemma(msg, { system, history: hist, fast: true });
      out = /"say"\s*:/.test(t) ? { say: t, details: t } : { say: t.split(/(?<=[.!?])\s/)[0], details: t };
    }
    out = unwrap(out);
    reply = { skill, say: out.say || "", details: out.details || out.say || "" };
  }

  reply = announce(reply, lang);

  // Save the chat after the answer is sent, so the founder never waits on it. Demo visitors' chats aren't kept.
  if (!isDemo())
    after(() =>
      saveMessages([
        { role: "user", text: msg },
        { role: "assistant", text: reply.details || reply.say, skill },
      ]).catch((err) => console.warn("Couldn't save the conversation:", err.message))
    );
  return Response.json(reply);
});
