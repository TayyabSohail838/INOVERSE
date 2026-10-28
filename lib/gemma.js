// Minimal Gemma client for the Gemini API (Google AI Studio key).
// Set GEMINI_API_KEY in .env.local. Optional: GEMMA_MODEL (default gemma-4-31b-it).

const BASE =
  process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models";

export async function gemma(prompt, { system, history = [], temperature = 0.7, json = false } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing in .env.local");
  const model = process.env.GEMMA_MODEL || "gemma-4-31b-it";

  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];

  const body = { contents, generationConfig: { temperature } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gemma API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return json ? parseJson(text) : text;
}

// Gemma sometimes wraps JSON in prose or ``` fences; pull out the first object.
export function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON in model reply");
  return JSON.parse(text.slice(start, end + 1));
}
