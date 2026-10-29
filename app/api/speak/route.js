// POST /api/speak  { text, lang?: "en" | "ur" } → audio/wav
// Inovo's voice, made with Gemini text-to-speech so it sounds the same in every browser.
// Short lines that repeat (like the greeting) are saved after the first time, so they
// play instantly and don't use up the free daily voice limit.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { speech } from "@/lib/gemma";
import { InputError } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const maxDuration = 60;

const CACHE_DIR = path.join(process.cwd(), ".next", "cache", "inovo-voice");
const CACHE_MAX_CHARS = 120;

const wavResponse = (wav) =>
  new Response(wav, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });

export const POST = route(async (req) => {
  const { text, lang = "en" } = await readJson(req);
  if (typeof text !== "string" || !text.trim()) throw new InputError("text is required");
  const line = text.trim().slice(0, 1500);

  const cacheable = line.length <= CACHE_MAX_CHARS;
  const file = cacheable
    ? path.join(
        CACHE_DIR,
        createHash("sha1").update(`${process.env.TTS_VOICE || "Charon"}|${line}`).digest("hex") + ".wav"
      )
    : null;
  if (file) {
    const saved = await fs.readFile(file).catch(() => null);
    if (saved) return wavResponse(saved);
  }

  const wav = await speech(line, lang === "ur" ? "ur" : "en");
  if (file) {
    // best effort: a read-only disk (e.g. some hosts) just means no cache
    await fs
      .mkdir(CACHE_DIR, { recursive: true })
      .then(() => fs.writeFile(file, wav))
      .catch(() => {});
  }
  return wavResponse(wav);
});
