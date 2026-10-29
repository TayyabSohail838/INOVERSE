// Minimal Gemma client for the Gemini API (Google AI Studio key).
// Set GEMINI_API_KEY in .env.local. Optional: GEMMA_MODEL (default gemma-4-31b-it),
// TRANSCRIBE_MODEL (default gemini-3.5-flash; Gemma 4 31B can't take audio).

const BASE =
  process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One generateContent call, with retries for Google's short overload spells.
// attempts: how many tries in total. Live chat uses few, so a busy model hands over
// to the backup quickly instead of running past the hosting time limit (60 s on Vercel).
async function generate(model, body, { timeoutMs = 90000, attempts = 4 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in .env.local");

  let res;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const last = attempt === attempts - 1;
    try {
      res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        // a dropped connection must not hang Inovo forever
        signal: AbortSignal.timeout(Number(process.env.GEMMA_TIMEOUT_MS) || timeoutMs),
      });
    } catch (err) {
      // network drop: retry, give up on the last attempt
      // a stalled request gets one more try, not three
      const stalled = err.name === "TimeoutError";
      if (last || (stalled && attempt >= 1)) {
        const e = new Error(stalled ? "Google AI is taking too long to answer. Try again in a moment." : `Couldn't reach Google AI: ${err.cause?.code || err.message}`);
        e.busy = true; // let the caller switch to the backup model
        throw e;
      }
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok || ![429, 500, 503].includes(res.status)) break;
    if (res.status === 429) {
      // A used-up daily limit won't come back by waiting a few seconds.
      const info = await res.text();
      if (/PerDay/i.test(info)) {
        const err = new Error(`${model} has used up its free daily limit.`);
        err.busy = true;
        err.quotaDay = true;
        err.retrySecs = Number(info.match(/"retryDelay":\s*"(\d+)s"/)?.[1]) || 3600;
        throw err;
      }
    }
    if (!last) await sleep(1000 * 2 ** attempt);
  }
  if (!res.ok) {
    if ([429, 500, 503].includes(res.status)) {
      const err = new Error("Inovo is getting a lot of questions right now. Try again in a few seconds.");
      err.busy = true;
      throw err;
    }
    throw new Error(`Google AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  // Gemma 4 returns its reasoning as parts marked `thought: true`; keep only the answer.
  return (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || "")
    .join("");
}

// When the main model is busy or down on Google's side, use the backups in order instead
// of failing. Backups are Gemini models with their own free quota, so several people
// chatting at once on the public link don't all wait on Gemma's per-minute limit.
// A busy model rests 5 minutes; one that used up its daily limit rests until Google resets it.
// GEMMA_FAST_FALLBACK / GEMMA_FALLBACK_MODEL take a comma-separated list, or "off".
const downUntil = new Map(); // model -> time to try it again

export async function gemma(prompt, opts = {}) {
  // Live conversation (fast: true) uses a quicker model: the 31B one can take 20+ seconds per reply.
  const main = opts.fast
    ? process.env.GEMMA_FAST_MODEL || "gemma-4-26b-a4b-it"
    : process.env.GEMMA_MODEL || "gemma-4-31b-it";
  const backups = (
    opts.fast
      ? process.env.GEMMA_FAST_FALLBACK || "gemini-3.5-flash-lite,gemini-2.5-flash-lite"
      : process.env.GEMMA_FALLBACK_MODEL || "gemma-4-26b-a4b-it,gemini-3.5-flash-lite"
  )
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== "off" && m !== main);
  const models = [main, ...backups];

  // skip resting models, but always keep at least the last one to try
  const ready = models.filter((m) => Date.now() >= (downUntil.get(m) || 0));
  const order = ready.length ? ready : models.slice(-1);

  let lastErr;
  for (const model of order) {
    try {
      return await gemmaWith(model, prompt, opts);
    } catch (err) {
      if (!err.busy) throw err;
      lastErr = err;
      const rest = err.quotaDay ? err.retrySecs * 1000 : 5 * 60 * 1000;
      downUntil.set(model, Date.now() + rest);
      console.warn(`${model} is busy or failing (${err.message}); resting it for ${Math.round(rest / 60000)} min.`);
    }
  }
  throw lastErr;
}

// fast: true skips most of the model's private reasoning and gives up sooner.
// Answers come back in seconds instead of a minute; used for live conversation.
async function gemmaWith(model, prompt, { system, history = [], temperature = 0.7, json = false, fast = false, timeoutMs, attempts } = {}) {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];
  const body = { contents, generationConfig: { temperature } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const think = fast ? (/^gemma/.test(model) ? { thinkingLevel: "minimal" } : noThinking(model)) : null;
  if (think) body.generationConfig.thinkingConfig = think;
  const limits = { timeoutMs: timeoutMs || (fast ? 25000 : 90000), attempts: attempts || (fast ? 2 : 4) };

  let text;
  try {
    text = await generate(model, body, limits);
  } catch (err) {
    // a model that doesn't support the setting: ask again without it
    if (!think || !/thinking/i.test(err.message)) throw err;
    delete body.generationConfig.thinkingConfig;
    text = await generate(model, body, limits);
  }
  return json ? parseJson(text) : text;
}

// Speech to text for the Talk button. `audio` is base64.
// The free tier allows ~20 transcriptions a day per model, so if the main one
// has used up its limit we go on to the next.
// Gemini 2.5 turns thinking off with a zero budget; Gemini 3 and later with the lowest level.
const noThinking = (model) =>
  /^gemini-2\.5/.test(model) ? { thinkingBudget: 0 } : /^gemini-[3-9]/.test(model) ? { thinkingLevel: "minimal" } : null;

const TRANSCRIBE_BACKUPS =["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const transcribeResting = new Map(); // model -> time it can be tried again

export async function transcribe(audio, mimeType, lang = "en") {
  const models = [process.env.TRANSCRIBE_MODEL || "gemini-3.5-flash", ...TRANSCRIBE_BACKUPS].filter(
    (m, i, all) => all.indexOf(m) === i
  );
  const prompt = [
    "Transcribe what the speaker says, word for word.",
    "Names that may come up: Inovix, Wattly, Fabriq AI, Kidz Lab, Gemma, NIC Faisalabad.",
    lang === "ur"
      ? "The speaker may use Urdu, English or a mix. Write Urdu in Roman Urdu (Latin letters)."
      : "The speaker is likely speaking English, possibly with some Urdu words.",
    "Reply with only the transcript. If there is no clear speech, reply with nothing.",
  ].join(" ");
  const contents = [{ role: "user", parts: [{ inline_data: { mime_type: mimeType, data: audio } }, { text: prompt }] }];
  let lastErr;
  for (const model of models) {
    if ((transcribeResting.get(model) || 0) > Date.now()) continue;
    try {
      // Writing down words needs no thinking, and thinking adds seconds before Inovo can answer.
      const body = { contents, generationConfig: { temperature: 0 } };
      const off = noThinking(model);
      if (off) body.generationConfig.thinkingConfig = off;
      let text;
      try {
        text = await generate(model, body, { timeoutMs: 30000 });
      } catch (err) {
        if (!off || !/thinking/i.test(err.message)) throw err;
        delete body.generationConfig.thinkingConfig;
        text = await generate(model, body, { timeoutMs: 30000 });
      }
      // keep words only: some models mark pauses with symbols like 📷
      return text.replace(/[\p{Extended_Pictographic}️]/gu, "").replace(/\s{2,}/g, " ").trim();
    } catch (err) {
      lastErr = err;
      if (!err.busy) throw err;
      if (err.quotaDay) transcribeResting.set(model, Date.now() + err.retrySecs * 1000);
      console.warn(`Transcription with ${model} failed (${err.message}); trying the next model.`);
    }
  }
  throw lastErr || new Error("Voice input is unavailable right now. Type your question instead.");
}

// Text to speech for the cofounder's voice. Returns a WAV file as a Buffer.
// The free tier allows only ~10 clips a day per voice model, so we go down a list
// of models and skip any that has used up its limit.
// TTS_MODEL: one model or a comma-separated list. TTS_VOICE (default Charon).
const TTS_MODELS = "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts";
const ttsResting = new Map(); // model -> time it can be tried again

export async function speech(text, lang = "en") {
  const models = (process.env.TTS_MODEL || TTS_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
  const voiceName = process.env.TTS_VOICE || "Charon";

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in .env.local");
  // Send only the words to say. Style instructions ("say this warmly…") get read
  // out loud by some voice models, which also throws the subtitles out of sync.
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });

  let res;
  for (const model of models) {
    if ((ttsResting.get(model) || 0) > Date.now()) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      }).catch(() => null);
      if (res?.ok) break;
      if (res?.status === 429) {
        // out of quota: rest this model (a day limit until Google's retry time, else a minute)
        const info = await res.text();
        const wait = Number(info.match(/"retryDelay":\s*"(\d+)s"/)?.[1]) || 60;
        ttsResting.set(model, Date.now() + (/PerDay/i.test(info) ? wait * 1000 : 60_000));
        console.warn(`Voice model ${model} is out of quota; trying the next one.`);
        break;
      }
      if (res && ![500, 503].includes(res.status)) break;
      await sleep(800);
    }
    if (res?.ok) break;
  }
  if (!res?.ok) {
    const err = new Error(`Voice service unavailable (${res?.status || "network"})`);
    err.status = res?.status;
    throw err;
  }

  const data = await res.json();
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) throw new Error("Voice service returned no audio");
  const audio = Buffer.from(part.inlineData.data, "base64");
  const mime = part.inlineData.mimeType || "";
  if (/wav/i.test(mime)) return audio;
  // Older models send raw 16-bit PCM ("audio/L16;rate=24000"): add a WAV header.
  const rate = Number(mime.match(/rate=(\d+)/)?.[1]) || 24000;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + audio.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

// Gemma sometimes wraps JSON in prose or ``` fences; pull out the first object.
export function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON in model reply");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    // The model sometimes adds a second object or a stray brace after the answer:
    // take the first complete {...} block, and drop trailing commas.
    const first = firstObject(text, start);
    if (!first) throw err;
    try {
      return JSON.parse(first);
    } catch {
      return JSON.parse(first.replace(/,\s*([}\]])/g, "$1"));
    }
  }
}

export function firstObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
