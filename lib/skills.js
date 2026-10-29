// Skill router: Gemma sees only names + descriptions, picks one, and the app
// then loads that skill's full instructions. Keeps Gemma's prompt small.
import fs from "node:fs/promises";
import path from "node:path";
import { roleByKey, roleForSkill } from "@/lib/roles";

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
      "Scope + gap check (5 reviewers, slow). Use when the founder has a NEW IDEA of their own (product, feature, business) and wants it checked before building. NOT for client requests, job offers, personal decisions, follow-up questions or general advice.",
  },
  {
    name: "client-scope",
    description:
      "A client or possible client wants something built for them (website, app, AI tool, automation). Scope it, give a PKR quote and say if it is worth taking.",
  },
  {
    name: "weekly-review",
    description:
      "Weekly team check-in: what's stalled, who does what, one goal for the week.",
  },
  {
    name: "market-sim",
    description:
      "Simulate how customers react to OUR EXISTING products (Wattly, Fabriq AI, Kidz Lab, Clinic Assistant, Mental Health Companion), compare them, or answer which of our products is best / which to focus on. Words like simulate, simulation, which product is best, compare our products.",
  },
  {
    name: "pricing-strategist",
    description:
      "How to charge: pricing model, PKR range, tiers, pilot offer.",
  },
  // The C-suite: one executive per area of the company (adapted from alirezarezvani/claude-skills, MIT)
  {
    name: "ceo-advisor",
    description:
      "CEO: company strategy and direction, fundraising, investors, incubators, mentors, board/investor updates, culture, long-term vision.",
  },
  {
    name: "cto-advisor",
    description:
      "CTO: tech stack, architecture, build vs buy, hosting, AI models, technical debt, scaling, hiring or managing developers.",
  },
  {
    name: "cfo-advisor",
    description:
      "CFO: cash, burn rate, runway, budget, costs, profit per customer, financial projections, fundraising numbers, taxes, spending decisions.",
  },
  {
    name: "cmo-advisor",
    description:
      "CMO: marketing, brand, positioning, messaging, target customer, social media, content, launch plan, marketing channels.",
  },
  {
    name: "coo-advisor",
    description:
      "COO: operations, processes, OKRs/quarter goals, bottlenecks, team routines, delivery, suppliers, execution planning.",
  },
  {
    name: "chro-advisor",
    description:
      "HR: hiring, interns, salaries, roles, team structure, onboarding, performance, motivation, conflicts, letting someone go.",
  },
  {
    name: "cpo-advisor",
    description:
      "CPO: product roadmap, which feature to build next, product-market fit, user feedback, MVP scope, kill or double down on a product.",
  },
  {
    name: "cro-advisor",
    description:
      "CRO: sales, finding customers, pipeline, closing deals, sales pitch, follow-ups, revenue targets, converting pilots, churn.",
  },
  {
    name: "ciso-advisor",
    description:
      "CISO: security, passwords, API keys, hacking risk, backups, customer/patient data safety, privacy, access control, incidents.",
  },
  {
    name: "general-counsel",
    description:
      "Legal: contracts, client agreements, NDAs, IP ownership, company registration, term sheets, compliance, legal risk.",
  },
];

export function routerPrompt(userMessage) {
  const list = SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  return `The user is the founder running the whole company. Each skill is one executive or specialist.
Pick the ONE skill that best fits the user's message. Prefer the specific skills (roast, client-scope, pricing-strategist, weekly-review, market-sim) when they fit exactly; otherwise pick the executive whose area it is. If none fits clearly, pick "solo-founder".
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
  const role = roleByKey(roleForSkill(skillName));
  return [
    persona,
    `\n\n# WHO IS SPEAKING\nIn this answer you speak as the ${role.label} (${role.area}) of the founder's company, reporting to the founder, who runs the whole company. Look at the question through that role's eyes. Do NOT introduce yourself or say your title: the app already announces "${role.label} here".`,
    skill && `\n\n# ACTIVE SKILL\n${skill}`,
    `\n\n# COMPANY CONTEXT\n${companyContext}`,
  ]
    .filter(Boolean)
    .join("");
}
