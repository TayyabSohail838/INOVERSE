// Skill router: Gemma sees only names + descriptions, picks one, and the app
// then loads that skill's full instructions. Keeps Gemma's prompt small.
import fs from "node:fs/promises";
import path from "node:path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export const SKILLS = [
  {
    name: "solo-founder",
    description:
      "Default. Open questions about what to build, cut, prioritise or focus on this week.",
  },
  {
    name: "roast",
    description:
      "Gap check before building: any new product, feature, client build or business idea to pressure-test. Returns GO / RESHAPE / KILL and a 48-hour test.",
  },
  {
    name: "weekly-review",
    description:
      "Weekly team check-in: what's stalled, who does what, one goal for the week.",
  },
  {
    name: "pricing-strategist",
    description:
      "How to charge: pricing model, PKR range, tiers, pilot offer.",
  },
];

export function routerPrompt(userMessage) {
  const list = SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  return `Pick the ONE skill that best fits the user's message. If none fits clearly, pick "solo-founder".
Skills:
${list}

User message: """${userMessage}"""

Reply with only JSON: {"skill": "<name>", "reason": "<one short sentence>"}`;
}

export function parseRouterReply(text) {
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (SKILLS.some((s) => s.name === json.skill)) return json;
  } catch {}
  return { skill: "solo-founder", reason: "fallback" };
}

// Strip YAML frontmatter; return the instructions to place in Gemma's system prompt.
export async function loadSkill(name) {
  if (!SKILLS.some((s) => s.name === name)) throw new Error(`unknown skill: ${name}`);
  const raw = await fs.readFile(path.join(SKILLS_DIR, `${name}.md`), "utf8");
  return raw.replace(/^---[\s\S]*?---\s*/, "");
}

// Every skill runs through the founder persona plus the company's own data.
export async function buildSystemPrompt(skillName, companyContext) {
  const persona = await loadSkill("solo-founder");
  const skill = skillName === "solo-founder" ? "" : await loadSkill(skillName);
  return [
    persona,
    skill && `\n\n# ACTIVE SKILL\n${skill}`,
    `\n\n# COMPANY CONTEXT\n${companyContext}`,
  ]
    .filter(Boolean)
    .join("");
}
