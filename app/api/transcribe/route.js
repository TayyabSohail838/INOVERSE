// POST /api/transcribe  { audio: base64 WAV, lang?: "en" | "ur" } → { text }
// Voice input for the Talk button. Done on the server so it doesn't depend on
// the browser's own speech service, which fails quietly on many setups.
import { transcribe } from "@/lib/gemma";
import { InputError } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const maxDuration = 60;

const MAX_BASE64 = 4_000_000; // about 60 seconds of 16 kHz mono WAV

export const POST = route(async (req) => {
  const { audio, lang = "en" } = await readJson(req);
  if (typeof audio !== "string" || !audio) throw new InputError("audio is required");
  if (audio.length > MAX_BASE64) throw new InputError("Recording is too long. Keep it under a minute.");
  const text = await transcribe(audio, "audio/wav", lang === "ur" ? "ur" : "en");
  return Response.json({ text });
});
