// POST /api/live { lang?, history? } → { token, model, setup }
// Real-time voice with Gemini Live: the browser streams the mic straight to Google and
// hears Inovo reply in about a second. The API key never leaves the server: the browser
// gets a short-lived, single-use token. Gemma still does the real work: for any skill
// (simulation, email, gap check, pricing, scoping…) Live calls the `inovo_brain` tool,
// which the browser answers with POST /api/cofounder.
import { buildContext } from "@/lib/context";
import { route, readJson } from "@/lib/http";

export const maxDuration = 30;

const API = "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";

function instructions(lang, context, history) {
  const urdu = lang === "ur";
  return `You are Inovo, the voice AI cofounder inside Inoverse, talking live with the founder of Inovix & Co, M Tayyab Sohail. Call him "boss" now and then.
Talk like a cofounder across the table: warm, direct and honest. Keep every turn to 1-3 short spoken sentences. No lists, no markdown, no reading out symbols.
${urdu ? 'Speak natural Pakistani Urdu, mixing in the English business words people really use. Start the conversation by saying "Hey boss, Inoverse mein khush aamdeed!" and ask in a few words what is on his mind.' : 'Start the conversation by saying exactly "Hey boss, welcome to Inoverse!" and then ask in a few words what is on his mind.'}
Support him; don't nag about pending projects unless he asks about them.

TOOL: inovo_brain runs Inovo's Gemma skills on the company's live data. ALWAYS call it when the founder asks to:
- simulate customers, compare products, or which product is best or to focus on;
- read or summarise his emails or inbox;
- check a new idea before building (gap check), scope a client project or quote a price;
- price a product, plan the week, or review the team;
- open a website or search something;
- anything that needs deep analysis or numbers you don't have below.
Before calling it, say a few words first, like "One sec, boss, let me check that." For a market simulation, product comparison or gap check, say instead that it takes about a minute. When the result comes back, say its "say" in your own words in 1-3 sentences and mention that the full answer is on screen. Never invent numbers, emails, prices, names or results that should come from the tool.
Answer by yourself only small talk, quick follow-ups on the last answer, and simple questions the COMPANY CONTEXT below already answers.

COMPANY CONTEXT
${context.slice(0, 14000)}${history ? `\n\nRECENT CHAT (typed or earlier)\n${history}` : ""}`;
}

// The company context takes a few seconds (database + calendar). Keep it for 2 minutes,
// and let the app load it early (GET) so Talk only has to make the token.
let cached = { at: 0, text: "", loading: null };
function companyContext() {
  if (cached.text && Date.now() - cached.at < 2 * 60 * 1000) return Promise.resolve(cached.text);
  if (!cached.loading) {
    cached.loading = buildContext()
      .catch(() => "Inovix & Co, a pre-revenue AI startup in Faisalabad, Pakistan.")
      .then((text) => {
        cached = { at: Date.now(), text, loading: null };
        return text;
      });
  }
  return cached.loading;
}

export const GET = route(async () => {
  await companyContext();
  return Response.json({ ready: true });
});

export const POST = route(async (req) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "GEMINI_API_KEY is missing." }, { status: 503 });
  const body = await readJson(req).catch(() => ({}));
  const lang = body.lang === "ur" ? "ur" : "en";
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-8)
    .map((m) => `${m.role === "assistant" ? "Inovo" : "Founder"}: ${String(m.text || "").replace(/\s+/g, " ").slice(0, 400)}`)
    .join("\n");

  const [context, tokenRes] = await Promise.all([
    companyContext(),
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // the session can last 30 minutes
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(), // must connect within a minute
      }),
    }),
  ]);
  if (!tokenRes.ok) {
    return Response.json({ error: `Live voice unavailable (${tokenRes.status}).` }, { status: 502 });
  }
  const { name: token } = await tokenRes.json();
  const model = process.env.LIVE_MODEL || "gemini-3.8-live";

  const setup = {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.TTS_VOICE || "Charon" } } },
    },
    systemInstruction: { parts: [{ text: instructions(lang, context, history) }] },
    tools: [
      {
        functionDeclarations: [
          {
            name: "inovo_brain",
            description:
              "Runs Inovo's Gemma skills on the company's live data: market simulation and product comparison, email summary, gap check of a new idea, client scoping and quotes, pricing, weekly review, tasks, meetings, people, opening websites. Returns what to say and shows the full answer on the founder's screen.",
            parameters: {
              type: "OBJECT",
              properties: {
                request: { type: "STRING", description: "The founder's request, in his own words, with any detail he gave." },
              },
              required: ["request"],
            },
          },
        ],
      },
    ],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // long talks: drop the oldest audio instead of ending the session
    contextWindowCompression: { slidingWindow: {} },
  };
  return Response.json({ token, model, setup });
});
