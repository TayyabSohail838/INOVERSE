// POST /api/weekly-review { updates: "what each person did / is stuck on" }
//   → health score (computed in code from commitments) + Gemma's review, saved
// GET  /api/weekly-review → past reviews
import { gemma } from "@/lib/gemma";
import { buildSystemPrompt } from "@/lib/skills";
import { buildContext } from "@/lib/context";
import { auditCommitments } from "@/lib/commitmentHealth";
import { listCommitments, saveWeeklyReview, listWeeklyReviews, InputError } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const maxDuration = 60;

const DAY = 864e5;

export const POST = route(async (req) => {
  const { updates = "", lang = "en" } = await readJson(req);
  if (typeof updates !== "string" || !updates.trim()) {
    throw new InputError("Add a short update from each person: what they did, what's next, what's stuck.");
  }

  const commitments = await listCommitments();
  const health = commitments.length
    ? auditCommitments(
        commitments.map((c) => ({
          name: c.name,
          days_since_touched: Math.max(0, Math.floor((Date.now() - Date.parse(c.last_touched_at)) / DAY)),
          next_action: c.next_action,
        }))
      )
    : null;

  const context = await buildContext();
  const system = await buildSystemPrompt("weekly-review", context);
  const prompt = `TEAM UPDATES:
"""${updates.trim().slice(0, 8000)}"""

COMMITMENTS:
${commitments.length ? commitments.map((c) => `- ${c.name} | owner: ${c.owner || "none"} | next action: ${c.next_action || "NONE"} | status: ${c.status}`).join("\n") : "(none recorded)"}

HEALTH (computed in code, report it as is): ${health ? JSON.stringify({ score: health.score, verdict: health.verdict, rows: health.rows }) : "no commitments recorded yet"}

Return ONLY the JSON object described in the skill, plus a "say" field: 1-2 spoken sentences with the one goal for the week${lang === "ur" ? " in simple Roman Urdu" : ""}.`;

  const output = await gemma(prompt, { system, temperature: 0.4, json: true });
  // The code's health score always wins over anything the model wrote
  if (health) output.health = { score: health.score, verdict: health.verdict, flags: health.rows.flatMap((r) => r.flags.map((f) => ({ item: r.name, flag: f }))) };

  const saved = await saveWeeklyReview({ updates, health, output });
  return Response.json({ review: output, health, id: saved?.id || null });
});

export const GET = route(async () => Response.json({ reviews: await listWeeklyReviews() }));
