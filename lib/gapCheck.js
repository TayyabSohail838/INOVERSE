// The gap check that runs before Inovix builds anything.
// 1 brief → 5 reviewers in parallel (Critic, Champion, Analyst, Investigator, Customer)
// → verdict computed in code → cheapest 48-hour test → Judge writes it up.
import { gemma } from "@/lib/gemma";
import { loadSkill } from "@/lib/skills";
import { synthesizeVerdict } from "@/lib/verdict";
import { cheapestTest, TESTS } from "@/lib/cheapestTest";

const REVIEWERS = {
  critic:
    "You are THE CRITIC. Assume this idea fails. Find the fatal flaw, the fastest way it dies, and the assumption most likely wrong. No hedging.",
  champion:
    "You are THE CHAMPION. Make the strongest case FOR this idea. Find the bigger opportunity in Pakistan's small-business market the team is missing.",
  analyst:
    "You are THE ANALYST. First principles only. Do the incentives line up? Does the money math work in PKR, in theory? Can this team build it with its skills and stack?",
  investigator:
    "You are THE INVESTIGATOR. Use ONLY the 'Evidence' section of COMPANY CONTEXT. You have no web access. If evidence is thin, say so and score 5 or lower. Never invent competitors, prices or figures.",
  customer:
    "You are THE CUSTOMER: the exact Pakistani buyer this idea targets (e.g. mill owner, clinic doctor, school principal). Speak in first person, honestly sceptical. Would you pay? What is your real objection? What PKR price feels fair?",
};

const PANEL_FORMAT = `Reply with ONLY this JSON:
{"stance": "one line", "points": ["3-5 sharp points"], "must_hear": "one sentence", "score": <integer 1-10>}
Score: 1 = walk away, 10 = no-brainer. Stay in character.`;

async function buildBrief(idea, context) {
  return gemma(
    `Turn the founder's idea into a brief using COMPANY CONTEXT. Use "unknown" for anything not stated. Do not invent facts.
IDEA: """${idea}"""
Reply with ONLY JSON: {"idea": "", "who_pays_and_how": "", "our_edge": "", "constraints": "",
"riskiest_assumption": "one of: ${Object.keys(TESTS).join(" | ")}", "target_price_pkr": <number or null>}`,
    { system: `# COMPANY CONTEXT\n${context}`, temperature: 0.2, json: true }
  );
}

async function runReviewer(role, brief, context) {
  const r = await gemma(`THE BRIEF:\n${JSON.stringify(brief, null, 2)}\n\n${PANEL_FORMAT}`, {
    system: `${REVIEWERS[role]}\n\n# COMPANY CONTEXT\n${context}`,
    temperature: 0.8,
    json: true,
  });
  const score = Math.min(10, Math.max(1, Math.round(Number(r.score) || 5)));
  return { ...r, score };
}

export async function runGapCheck({ idea, context, lang = "en" }) {
  const brief = await buildBrief(idea, context);

  const roles = Object.keys(REVIEWERS);
  const results = await Promise.all(roles.map((role) => runReviewer(role, brief, context)));
  const panel = Object.fromEntries(roles.map((role, i) => [role, results[i]]));

  const verdict = synthesizeVerdict(
    Object.fromEntries(roles.map((role) => [role, panel[role].score]))
  );
  const risk = TESTS[brief.riskiest_assumption] ? brief.riskiest_assumption : "demand";
  const test = cheapestTest(risk, { price: brief.target_price_pkr || undefined });

  const roastSkill = await loadSkill("roast");
  const judge = await gemma(
    `You are THE JUDGE. The verdict is already decided by code: ${verdict.verdict} (confidence ${verdict.confidence}).
Do NOT change it. ${verdict.tension ? `Resolve this tension: ${verdict.tension}` : ""}
${verdict.gates.length ? `Gates that blocked GO: ${verdict.gates.join(" ")}` : ""}

BRIEF: ${JSON.stringify(brief)}
PANEL: ${JSON.stringify(panel)}
CHEAPEST TEST (make it specific to this idea): ${JSON.stringify(test)}

Reply with ONLY JSON:
{"say": "2 spoken sentences: the verdict and the one thing to do next. No markdown.${lang === "ur" ? " Simple Roman Urdu." : ""}",
 "details": "the full write-up in markdown, in the exact verdict shape from the skill"}`,
    { system: roastSkill + `\n\n# COMPANY CONTEXT\n${context}`, temperature: 0.4, json: true }
  );

  return {
    say: judge.say,
    details: judge.details,
    gapCheck: { brief, panel, verdict, test },
  };
}
