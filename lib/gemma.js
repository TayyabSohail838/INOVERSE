// Minimal Gemma client for the Gemini API (Google AI Studio key).
// Set GEMINI_API_KEY in .env.local. Optional: GEMMA_MODEL (default gemma-4-31b-it),
// TRANSCRIBE_MODEL (default gemini-3.5-flash; Gemma 4 31B can't take audio).

const BASE =
  process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One generateContent call, with retries for Google's short overload spells.
async function generate(model, body, timeoutMs = 90000) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in .env.local");

  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
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
      if (attempt === 3 || (stalled && attempt >= 1)) {
        throw new Error(stalled ? "Google AI is taking too long to answer. Try again in a moment." : `Couldn't reach Google AI: ${err.cause?.code || err.message}`);
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
    await sleep(1000 * 2 ** attempt);
  }
  if (!res.ok) {
    if ([429, 500, 503].includes(res.status)) {
      const err = new Error("Google's AI service is having trouble right now. Try again in a few seconds.");
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

// When the main Gemma model is down on Google's side, use a smaller one for a
// few minutes instead of failing. Set GEMMA_FALLBACK_MODEL=off to disable.
let mainDownUntil = 0;

export async function gemma(prompt, opts = {}) {
  // Live conversation (fast: true) uses a quicker model: the 31B one can take 20+ seconds per reply.
  const main = opts.fast
    ? process.env.GEMMA_FAST_MODEL || "gemma-4-26b-a4b-it"
    : process.env.GEMMA_MODEL || "gemma-4-31b-it";
  const fallback = process.env.GEMMA_FALLBACK_MODEL || "gemma-4-26b-a4b-it";
  const canFallBack = fallback !== "off" && fallback !== main;

  if (canFallBack && Date.now() < mainDownUntil) return gemmaWith(fallback, prompt, opts);
  try {
    return await gemmaWith(main, prompt, opts);
  } catch (err) {
    if (!err.busy || !canFallBack) throw err;
    console.warn(`${main} is failing on Google's side; using ${fallback} for the next 5 minutes.`);
    mainDownUntil = Date.now() + 5 * 60 * 1000;
    return gemmaWith(fallback, prompt, opts);
  }
}

// fast: true skips most of Gemma's private reasoning ("thinkingLevel: minimal").
// Answers come back in seconds instead of a minute; used for live conversation.
async function gemmaWith(model, prompt, { system, history = [], temperature = 0.7, json = false, fast = false } = {}) {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];
  const body = { contents, generationConfig: { temperature } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (fast) body.generationConfig.thinkingConfig = { thinkingLevel: "minimal" };

  let text;
  try {
    text = await generate(model, body, fast ? 45000 : 90000);
  } catch (err) {
    // a model that doesn't support the setting: ask again without it
    if (!fast || !/thinking/i.test(err.message)) throw err;
    delete body.generationConfig.thinkingConfig;
    text = await generate(model, body, fast ? 45000 : 90000);
  }
  return json ? parseJson(text) : text;
}

// Speech to text for the Talk button. `audio` is base64.
// The free tier allows ~20 transcriptions a day per model, so if the main one
// has used up its limit we go on to the next.
const TRANSCRIBE_BACKUPS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
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
  const body = {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: mimeType, data: audio } }, { text: prompt }] }],
    generationConfig: { temperature: 0 },
  };
  let lastErr;
  for (const model of models) {
    if ((transcribeResting.get(model) || 0) > Date.now()) continue;
    try {
      const text = await generate(model, body);
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
