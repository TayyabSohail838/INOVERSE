// Market simulation, modelled on MiroFish (github.com/666ghj/MiroFish), built on Gemma:
//   seed brief → customer personas → round 1 (each reacts alone) → round 2 (they hear
//   each other) → report. "Compare" runs a short one-round simulation for every product
//   and ranks them. The numbers (market pull, decisions) are computed here, not by the model.
// Synthetic customers find what to TEST with real people. They are not proof of demand.
import fs from "node:fs/promises";
import path from "node:path";
import { gemma, firstObject } from "@/lib/gemma";
import { dbEnabled } from "@/lib/db";
import { getCompany, listEvidence, InputError } from "@/lib/store";

export const SCENARIOS = {
  launch: {
    label: "Launch",
    ask: "Product launch: how do these customers react to the offer as it stands? Show skeptical, base and optimistic cases and the assumptions most likely to break the launch.",
  },
  pricing: {
    label: "Pricing",
    ask: "Pricing change: compare three versions: (a) the current price, (b) the proposed price change, (c) the proposed price with added value. Which one do customers accept, and what value would they pay more for?",
  },
  positioning: {
    label: "Message",
    ask: "Positioning: compare a price-led message (cheap, saves money) against an outcome-led message (the result the customer gets). Which one wins with each segment, and what would a real A/B test look like?",
  },
};

const DECISIONS = ["buy", "pilot", "maybe", "no"];
const DECISION_VALUE = { buy: 1, pilot: 0.75, maybe: 0.35, no: 0 };
const READINESS = { idea: 2, prototype: 5, pilot: 7, live: 8, paying: 9 };

// A JSON reply the model garbled once is usually fine on the second try.
async function ask(prompt, opts) {
  try {
    return await gemma(prompt, opts);
  } catch (err) {
    if (!(err instanceof SyntaxError) && !/No JSON/.test(err.message)) throw err;
    return gemma(prompt, { ...opts, temperature: Math.max(0.2, (opts.temperature ?? 0.7) - 0.3) });
  }
}

// For list replies (personas, reactions) the model sometimes splits the list into several
// blocks. Read the raw text and collect every object that has `key`, wherever it is.
// Also returns the first object that has `extra` (summary fields like "ease").
function scanObjects(text, key, extra) {
  const found = [];
  let summary = null;
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (key in v) found.push(v);
    if (extra && !summary && extra in v) summary = v;
    Object.values(v).forEach(walk);
  };
  let i = text.indexOf("{");
  while (i !== -1) {
    const block = firstObject(text, i);
    if (!block) break;
    let parsed = null;
    try {
      parsed = JSON.parse(block);
    } catch {
      try {
        parsed = JSON.parse(block.replace(/,\s*([}\]])/g, "$1"));
      } catch {}
    }
    if (parsed) {
      walk(parsed);
      i = text.indexOf("{", i + block.length);
    } else {
      i = text.indexOf("{", i + 1); // broken outer block: look inside it
    }
  }
  return { items: found, summary };
}

async function askList(prompt, opts, key, extra) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await gemma(prompt, { ...opts, json: false, temperature: attempt ? 0.5 : opts.temperature });
    const out = scanObjects(text, key, extra);
    if (out.items.length >= 3) return out;
  }
  throw new Error("The simulation got an unreadable answer from the AI twice. Try again.");
}

const noDot = (s) => String(s || "").replace(/[.s]+$/, "");
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
const list = (v, n, len = 220) => (Array.isArray(v) ? v.slice(0, n).map((x) => (typeof x === "string" ? clip(x, len) : x)).filter(Boolean) : []);

// ---------- seed material ----------
async function briefsFile() {
  try {
    return await fs.readFile(path.join(process.cwd(), "data", "product-briefs.md"), "utf8");
  } catch {
    return "";
  }
}

function sectionFor(md, name) {
  const parts = md.split(/^## /m).slice(1);
  const key = name.toLowerCase();
  const hit = parts.find((p) => {
    const title = p.split("\n")[0].trim().toLowerCase();
    return title === key || title.includes(key) || key.includes(title);
  });
  return hit ? hit.split("\n").slice(1).join("\n").trim() : "";
}

export async function listProducts() {
  if (dbEnabled()) {
    const { products } = await getCompany();
    if (products?.length) return products.map((p) => ({ name: p.name, description: p.description || "", stage: p.stage || "prototype" }));
  }
  // no database: the product names in the briefs file
  const md = await briefsFile();
  return md
    .split(/^## /m)
    .slice(1)
    .map((p) => ({ name: p.split("\n")[0].trim(), description: "", stage: "prototype" }));
}

async function findProduct(name) {
  const products = await listProducts();
  const key = String(name || "").toLowerCase().trim();
  const p = products.find((x) => x.name.toLowerCase() === key) || products.find((x) => key && x.name.toLowerCase().includes(key));
  if (!p) throw new InputError(`Unknown product: ${clip(name, 60)}`);
  return p;
}

// The brief the personas read: the written brief, plus any real evidence logged for this product.
export async function seedBrief(name) {
  const p = await findProduct(name);
  const written = sectionFor(await briefsFile(), p.name);
  let evidence = [];
  if (dbEnabled()) {
    const rows = await listEvidence(60).catch(() => []);
    const key = p.name.toLowerCase();
    evidence = rows
      .filter((e) => (e.product || "").toLowerCase().includes(key) || `${e.title} ${e.content}`.toLowerCase().includes(key))
      .slice(0, 8)
      .map((e) => `- (${e.kind}) ${clip(e.title, 120)}: ${clip(e.content, 300)}`);
  }
  const text = [
    `Product: ${p.name} (stage: ${p.stage})`,
    p.description && `What it is: ${p.description}`,
    written,
    evidence.length && `Real evidence logged by the team:\n${evidence.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { product: p.name, stage: p.stage, brief: text };
}

// ---------- the simulation steps ----------
const SYSTEM =
  "You run a market simulation for Inovix & Co, a small AI startup in Faisalabad, Pakistan. You play realistic Pakistani customers: their budgets, habits, trust issues and the way they talk. Be honest: most people do not buy new things easily. Never invent real company names or real people. Reply with ONLY JSON.";

const sayRule = (lang) =>
  lang === "ur" ? "Write the \"say\" field in simple Roman Urdu; everything else in English." : "Write in plain English.";

function cleanPersonas(raw) {
  const ps = list(raw?.personas, 8).map((p, i) => ({
    id: i + 1,
    name: clip(p.name, 40) || `Customer ${i + 1}`,
    segment: clip(p.segment, 60) || "General",
    role: clip(p.role, 90),
    city: clip(p.city, 30),
    budget: clip(p.budget, 80),
    today: clip(p.today || p.current_behavior, 160),
    leaning: clip(p.leaning, 20).toLowerCase(),
  }));
  if (ps.length < 3) throw new Error("The simulation couldn't create customer personas. Try again.");
  return ps;
}

export async function makePersonas({ brief, scenario = "launch", question = "", count = 6 }) {
  const sc = SCENARIOS[scenario] || SCENARIOS.launch;
  const { items } = await askList(
    `SEED BRIEF
${clip(brief, 6000)}

SIMULATION QUESTION
${sc.ask}${question ? `\nFounder's question: ${clip(question, 400)}` : ""}

Create ${count} distinct customer personas who would realistically meet this offer in Pakistan.
Mix: 3-4 likely buyers from DIFFERENT segments, 1 clear skeptic, and 1 person who influences the buying decision (an accountant, a manager, a parent, a doctor…).
Reply with ONLY JSON:
{"personas": [{"name": "first name + last name", "segment": "short segment label", "role": "who they are, one line", "city": "", "budget": "what they can spend, in PKR", "today": "how they solve the problem today", "leaning": "positive | neutral | skeptical"}]}`,
    { system: SYSTEM, temperature: 0.9, fast: true },
    "segment"
  );
  return cleanPersonas({ personas: items });
}

function cleanReactions(raw, personas) {
  const rs = list(raw?.reactions, 10);
  return personas.map((p) => {
    const r = rs.find((x) => clip(x?.name, 40).toLowerCase() === p.name.toLowerCase()) || rs[p.id - 1] || {};
    const decision = DECISIONS.includes(String(r.decision).toLowerCase()) ? String(r.decision).toLowerCase() : "maybe";
    return {
      name: p.name,
      sentiment: num(r.sentiment, -2, 2, 0),
      decision,
      max_price: clip(r.max_price ?? r.max_price_pkr, 60),
      says: clip(r.says, 280),
      objection: clip(r.objection, 200),
      trigger: clip(r.trigger, 200),
      changed: Boolean(r.changed),
      influenced_by: clip(r.influenced_by, 40),
    };
  });
}

const personaLines = (personas) =>
  personas.map((p) => `- ${p.name} (${p.segment}): ${p.role}; ${p.city}; budget ${p.budget}; today: ${p.today}; leaning ${p.leaning}`).join("\n");

const REACTION_SHAPE = `{"reactions": [{"name": "exact persona name", "sentiment": -2 to 2, "decision": "buy | pilot | maybe | no", "max_price": "the most they would pay, in PKR, with the period", "says": "1-2 sentences in their own voice (English or Roman Urdu mix, as they would talk)", "objection": "their main objection, or empty", "trigger": "what would make them say yes", "changed": true or false, "influenced_by": "name of the persona who changed their mind, or empty"}]}`;

// round 1: each persona meets the offer alone. round 2: they hear each other (a trade
// association meeting, a WhatsApp group, a parents' group) and may change their mind.
export async function runRound({ brief, scenario = "launch", question = "", personas, round = 1, previous = [] }) {
  const sc = SCENARIOS[scenario] || SCENARIOS.launch;
  const ps = cleanPersonas({ personas });
  const social =
    round > 1 && previous.length
      ? `\nROUND ${round}: the personas now meet (a WhatsApp group, a trade association, a parents' group — whatever fits) and hear each other's views from the last round:
${previous.map((r) => `- ${clip(r.name, 40)}: ${clip(r.decision, 10)}, "${clip(r.says, 200)}"${r.objection ? ` Objection: ${clip(r.objection, 140)}` : ""}`).join("\n")}
Each persona reacts again. Some may be persuaded or put off by someone else, but people rarely change much; mark "changed": true only if their decision changed, and say who influenced them.`
      : `\nROUND 1: each persona meets the offer alone, for the first time. "changed" is false for everyone.`;
  const { items } = await askList(
    `SEED BRIEF
${clip(brief, 6000)}

SIMULATION QUESTION
${sc.ask}${question ? `\nFounder's question: ${clip(question, 400)}` : ""}

PERSONAS
${personaLines(ps)}
${social}

Reply with ONLY JSON, one entry per persona:
${REACTION_SHAPE}`,
    { system: SYSTEM, temperature: 0.8, fast: true },
    "decision"
  );
  return cleanReactions({ reactions: items }, ps);
}

// Market pull 0-10 from what the personas decided and felt (pure arithmetic).
export function marketPull(reactions) {
  if (!reactions?.length) return 0;
  const v = reactions.reduce((s, r) => s + 0.55 * (DECISION_VALUE[r.decision] ?? 0.35) + 0.45 * ((r.sentiment + 2) / 4), 0) / reactions.length;
  return Math.round(v * 100) / 10;
}

export function decisionCounts(reactions) {
  return Object.fromEntries(DECISIONS.map((d) => [d, reactions.filter((r) => r.decision === d).length]));
}

export async function writeReport({ product, brief, scenario = "launch", question = "", personas, rounds, lang = "en" }) {
  const sc = SCENARIOS[scenario] || SCENARIOS.launch;
  const ps = cleanPersonas({ personas });
  const last = rounds.at(-1) || [];
  const pull = marketPull(last);
  const counts = decisionCounts(last);
  const transcript = rounds
    .map((rs, i) => `ROUND ${i + 1}\n${rs.map((r) => `- ${r.name}: ${r.decision} (sentiment ${r.sentiment}, max ${r.max_price}) "${r.says}" Objection: ${r.objection || "none"}. Yes if: ${r.trigger || "-"}${r.changed ? ` [changed, influenced by ${r.influenced_by || "the group"}]` : ""}`).join("\n")}`)
    .join("\n\n");
  const out = await ask(
    `SEED BRIEF
${clip(brief, 5000)}

SIMULATION QUESTION
${sc.ask}${question ? `\nFounder's question: ${clip(question, 400)}` : ""}

PERSONAS
${personaLines(ps)}

WHAT HAPPENED
${transcript}

Computed result after the last round: market pull ${pull}/10; decisions ${JSON.stringify(counts)}.

You are the report agent. Analyse ONLY what happened above. Reply with ONLY JSON:
{"headline": "one sentence verdict for ${product}",
 "say": "2-3 spoken sentences for the founder: the result, the biggest objection, and the next real-world test. No symbols. ${sayRule(lang)}",
 "segments": [{"name": "", "fit": "high | medium | low", "why": "one line"}],
 "objections": ["recurring objections, most common first"],
 "trust_barriers": ["what stops them trusting or switching"],
 "triggers": ["what makes them say yes"],
 "pricing": "one or two lines: what price they accept and why",
 "search_words": ["4-6 phrases these customers would type or say when looking for this"],
 "scenarios": {"skeptical": {"pilots_of_10": 0-10, "story": "one line"}, "base": {"pilots_of_10": 0-10, "story": ""}, "optimistic": {"pilots_of_10": 0-10, "story": ""}},
 "fragile": ["assumptions where a small change flips the result"],
 "hypotheses": ["exactly 5 hypotheses to test with REAL people, each falsifiable"],
 "next_test": {"name": "short name", "do": "what to do in the next 48 hours", "cost": "in PKR", "pass": "the number that counts as a pass"}}
"pilots_of_10" means: out of 10 customers like these that Inovix pitches, how many start a paid pilot.`,
    { system: "You are the report agent of a market simulation. Be specific and honest, and never claim synthetic customers prove real demand. Reply with ONLY JSON.", temperature: 0.4, json: true }
  );
  const sc3 = out?.scenarios || {};
  const scen = (k) => ({ pilots_of_10: num(sc3[k]?.pilots_of_10, 0, 10, 0), story: clip(sc3[k]?.story, 220) });
  return {
    pull,
    counts,
    headline: clip(out?.headline, 220),
    say: clip(out?.say, 600),
    segments: list(out?.segments, 5).map((s) => ({ name: clip(s.name, 60), fit: ["high", "medium", "low"].includes(s.fit) ? s.fit : "medium", why: clip(s.why, 200) })),
    objections: list(out?.objections, 6),
    trust_barriers: list(out?.trust_barriers, 5),
    triggers: list(out?.triggers, 5),
    pricing: clip(out?.pricing, 400),
    search_words: list(out?.search_words, 6, 80),
    scenarios: { skeptical: scen("skeptical"), base: scen("base"), optimistic: scen("optimistic") },
    fragile: list(out?.fragile, 5),
    hypotheses: list(out?.hypotheses, 5),
    next_test: {
      name: clip(out?.next_test?.name, 80),
      do: clip(out?.next_test?.do, 400),
      cost: clip(out?.next_test?.cost, 60),
      pass: clip(out?.next_test?.pass, 200),
    },
  };
}

// ---------- compare every product ----------
// Each product meets 8 customers in one call (run in parallel). Separately, one call judges
// how fast a small team can land the first sale for ALL products side by side, so the scores
// are spread out. The browser runs these as separate requests (each well under 60 s).
const memo = new Map(); // key → { at, value }: reuse results for 30 minutes (free AI quota)
async function remember(key, fn, fresh) {
  const hit = memo.get(key);
  if (!fresh && hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.value;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}

export function quickSim(name, { fresh = false } = {}) {
  return remember(`quick:${String(name).toLowerCase()}`, () => quickSimRun(name), fresh);
}

async function quickSimRun(name) {
  const { product, stage, brief } = await seedBrief(name);
  const { items, summary } = await askList(
    `SEED BRIEF
${brief}

Simulate 8 realistic Pakistani customers meeting this offer for the first time: 5 likely buyers from different segments, 2 skeptics, 1 decision influencer.
Reply with ONLY JSON:
{"personas": [{"name": "", "segment": "", "decision": "buy | pilot | maybe | no", "sentiment": -2 to 2, "max_price": "in PKR with period", "says": "one sentence in their voice", "objection": ""}],
 "best_segment": "the segment most likely to pay first",
 "biggest_risk": "one line"}`,
    { system: SYSTEM, temperature: 0.8, fast: true },
    "decision",
    "biggest_risk"
  );
  const out = summary || {};
  const personas = list(items, 10).map((p) => ({
    name: clip(p.name, 40),
    segment: clip(p.segment, 60),
    decision: DECISIONS.includes(String(p.decision).toLowerCase()) ? String(p.decision).toLowerCase() : "maybe",
    sentiment: num(p.sentiment, -2, 2, 0),
    max_price: clip(p.max_price, 60),
    says: clip(p.says, 240),
    objection: clip(p.objection, 200),
  }));
  return {
    product,
    stage,
    pull: marketPull(personas),
    readiness: READINESS[stage] ?? 5,
    counts: decisionCounts(personas),
    personas,
    best_segment: clip(out.best_segment, 120),
    biggest_risk: clip(out.biggest_risk, 220),
  };
}

// How fast can a 3-person part-time team get the FIRST paying customer? All products at once.
export function judgeEase({ fresh = false } = {}) {
  return remember("ease", judgeEaseRun, fresh);
}

async function judgeEaseRun() {
  const products = (await listProducts()).slice(0, 6);
  const md = await briefsFile();
  const text = products
    .map((p) => `## ${p.name} (stage: ${p.stage})\n${p.description}\n${sectionFor(md, p.name).slice(0, 900)}`)
    .join("\n\n");
  const out = await ask(
    `${text}

Inovix & Co is pre-revenue: 3 part-time students in Faisalabad, little money, no sales team.
For EACH product, judge how fast this team can get its FIRST paying customer: hardware or install needs, sales cycle, trust and regulation, and whether a real user or warm lead already exists.
Compare them against each other and use the full range (1 = a year or more away, 10 = could be paid this month). Avoid giving every product the same score.
Reply with ONLY JSON:
{"products": [{"name": "exact product name", "ease": 1-10, "why": "one line"}]}`,
    { system: "You are a blunt startup advisor in Pakistan. Reply with ONLY JSON.", temperature: 0.2, json: true, fast: true }
  );
  const rows = list(out?.products, 10);
  return Object.fromEntries(
    products.map((p) => {
      const r = rows.find((x) => clip(x?.name, 80).toLowerCase() === p.name.toLowerCase()) || rows.find((x) => p.name.toLowerCase().includes(clip(x?.name, 80).toLowerCase().split(" ")[0])) || {};
      return [p.name, { ease: num(r.ease, 1, 10, (READINESS[p.stage] ?? 5) - 1), why: clip(r.why, 220) }];
    })
  );
}

export async function compareProducts({ lang = "en", fresh = false } = {}) {
  const products = (await listProducts()).slice(0, 6);
  if (!products.length) throw new InputError("Add your products in the Company panel first.");
  // a stalled answer gets one more try, so no product silently drops out of the ranking
  const again = (fn) => fn().catch(() => fn());
  const [ease, ...settled] = await Promise.allSettled([again(() => judgeEase({ fresh })), ...products.map((p) => again(() => quickSim(p.name, { fresh })))]);
  const results = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!results.length) throw settled[0].reason;
  const value = await rankResults(results, ease.status === "fulfilled" ? ease.value : {}, lang);
  value.failed = settled.map((s, i) => (s.status === "rejected" ? products[i].name : null)).filter(Boolean);
  return value;
}

export async function rankResults(results, ease = {}, lang = "en") {
  // 50% simulated demand, 30% how fast the first sale can happen, 20% how far the product already is
  const ranked = results
    .map((r) => {
      const e = ease[r.product] || { ease: Math.max(1, r.readiness - 1), why: "" };
      const score = Math.round((0.5 * r.pull + 0.3 * e.ease + 0.2 * r.readiness) * 10) / 10;
      return { ...r, ease: e.ease, ease_why: e.why, score };
    })
    .sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => (r.verdict = i === 0 ? "Focus" : i < 3 && r.score >= ranked[0].score - 1.5 ? "Keep warm" : "Park"));

  let words = {};
  const summaryCall = (opts) => ask(
      `Market simulation results for Inovix & Co's products, already ranked (score = 50% simulated customer demand, 30% speed of the first sale, 20% product readiness):
${ranked.map((r, i) => `${i + 1}. ${r.product} (stage ${r.stage}) — score ${r.score}/10, ${r.verdict}. Demand ${r.pull}/10 (${r.counts.buy} buy, ${r.counts.pilot} pilot, ${r.counts.maybe} maybe, ${r.counts.no} no). First sale ${r.ease}/10: ${r.ease_why}. Best first customers: ${r.best_segment}. Risk: ${r.biggest_risk}`).join("\n")}

The team is 3 part-time students, pre-revenue. Keep the ranking as given. Reply with ONLY JSON:
{"say": "2-3 spoken sentences: which product to focus on, why, and what to do this week. No symbols or lists. ${sayRule(lang)}",
 "why_best": "2-3 sentences on why number 1 wins over number 2",
 "fastest_cash": "one sentence: which product can bring money soonest and how",
 "this_week": "one concrete action for this week"}`,
      { system: "You are Inovo, the founder's AI cofounder. Be direct and honest. Use only the results given.", temperature: 0.3, json: true, ...opts }
    );
  try {
    words = await summaryCall({ fast: true });
  } catch {
    // Google busy right after the parallel calls: wait a moment and ask the fast model again
    // (the 31B model has its own quota but can take minutes, too slow for voice)
    try {
      await new Promise((r) => setTimeout(r, 2500));
      words = await summaryCall({ fast: true });
    } catch (err) {
      console.warn("Simulation summary failed:", err.message); // the ranking itself is arithmetic
    }
  }
  const best = ranked[0];
  return {
    ranking: ranked,
    best: best.product,
    say: clip(words?.say, 600) || `${best.product} came out on top with ${best.score} out of 10. Its best first customers are ${noDot(best.best_segment)}.`,
    why_best: clip(words?.why_best, 600),
    fastest_cash: clip(words?.fastest_cash, 300),
    this_week: clip(words?.this_week, 300),
    at: new Date().toISOString(),
  };
}

// "Simulate Wattly", "which product is best": used by the chat and voice.
export function namedProduct(text, products) {
  const t = text.toLowerCase();
  const alias = (n) => [n.toLowerCase(), n.toLowerCase().split(/\s+/)[0]].filter((a) => a.length > 3);
  return products.find((p) => alias(p.name).some((a) => t.includes(a)))?.name || null;
}

export async function simulateForChat({ message, lang = "en" }) {
  const products = await listProducts();
  const name = namedProduct(message, products);
  const compare = !name || /\b(best|compare|which|rank|focus|all|sab|konsa|kaun\s?sa)\b/i.test(message);
  if (compare) {
    const c = await compareProducts({ lang });
    const details = [
      `**Market simulation: ${c.best} comes out on top.**`,
      "",
      ...c.ranking.map((r, i) => `${i + 1}. **${r.product}**: ${r.score}/10 (${r.verdict}). Demand ${r.pull}, ease ${r.ease}. Best first customers: ${noDot(r.best_segment)}.`),
      "",
      c.why_best,
      c.fastest_cash && `**Fastest cash:** ${c.fastest_cash}`,
      c.this_week && `**This week:** ${c.this_week}`,
      c.failed?.length ? `**Not included:** ${c.failed.join(", ")} (the AI didn't answer in time). Ask again before trusting the winner.` : null,
      "",
      "_Synthetic customers: use this to choose what to test with real people, not as proof of demand. Open Simulate for the full run._",
    ]
      .filter((x) => typeof x === "string")
      .join("\n");
    return { skill: "market-sim", say: c.say, details, simulation: { kind: "compare", ...c } };
  }
  const r = await quickSim(name);
  const say =
    lang === "ur"
      ? `${r.product} ki simulation mein demand ${r.pull} out of 10 aayi. Sab se bari rukawat: ${r.biggest_risk}`
      : `In the simulation ${r.product} scored ${r.pull} out of 10 for demand. ${r.counts.buy + r.counts.pilot} of ${r.personas.length} customers would buy or pilot it. The biggest risk is ${r.biggest_risk.replace(/\.$/, "")}.`;
  const details = [
    `**${r.product}: demand ${r.pull}/10** (buy ${r.counts.buy}, pilot ${r.counts.pilot}, maybe ${r.counts.maybe}, no ${r.counts.no})`,
    "",
    ...r.personas.map((p) => `- **${p.name}** (${p.segment}), ${p.decision}: "${p.says}"${p.objection ? ` Objection: ${p.objection}` : ""}`),
    "",
    `**Best first customers:** ${r.best_segment}`,
    `**Biggest risk:** ${r.biggest_risk}`,
    "",
    "_Open Simulate for the full two-round simulation and report._",
  ].join("\n");
  return { skill: "market-sim", say, details, simulation: { kind: "single", ...r } };
}

// Clear simulation requests skip the skill router: "simulate Wattly", "which product is best?",
// "compare our products", "konsa product best hai".
export function detectSimIntent(text) {
  const t = text.toLowerCase();
  if (/\bsimulat\w*\b/.test(t)) return true;
  if (/\b(products?|idea)\b/.test(t) && /\b(best|strongest|focus|compare|rank|winner|konsa|kaunsa|kaun sa|behtar)\b/.test(t)) return true;
  return false;
}
