// Market simulation (MiroFish-style), one step per request so each stays well under
// Vercel's time limit and the panel can show progress.
// GET  /api/simulate                       → { products, scenarios }
// POST /api/simulate { step: "brief", product }                          → { product, stage, brief }
// POST /api/simulate { step: "personas", brief, scenario, question }     → { personas }
// POST /api/simulate { step: "round", brief, scenario, question, personas, round, previous } → { reactions, pull }
// POST /api/simulate { step: "report", product, brief, scenario, question, personas, rounds, lang } → { report }
// POST /api/simulate { step: "quick", product, fresh }                  → one product meets 8 customers
// POST /api/simulate { step: "ease", fresh }                            → speed of the first sale, every product
// POST /api/simulate { step: "rank", results, ease, lang }              → the ranking + Inovo's take
// POST /api/simulate { step: "compare", lang, fresh }                    → all three in one request (chat uses this)
// Nothing is saved, so it also runs on the public demo.
import { route, readJson } from "@/lib/http";
import { InputError } from "@/lib/store";
import { SCENARIOS, listProducts, seedBrief, makePersonas, runRound, writeReport, marketPull, compareProducts, quickSim, judgeEase, rankResults, decisionCounts } from "@/lib/simulate";

export const maxDuration = 60;

export const GET = route(async () => {
  const products = await listProducts();
  return Response.json({
    products,
    scenarios: Object.entries(SCENARIOS).map(([key, s]) => ({ key, label: s.label, ask: s.ask })),
  });
});

const arr = (v, name) => {
  if (!Array.isArray(v) || !v.length) throw new InputError(`${name} is required`);
  return v.slice(0, 8);
};
const brief = (v) => {
  if (typeof v !== "string" || v.trim().length < 20) throw new InputError("The seed brief is too short.");
  return v.slice(0, 6000);
};

export const POST = route(async (req) => {
  const b = await readJson(req);
  const scenario = SCENARIOS[b.scenario] ? b.scenario : "launch";
  const question = typeof b.question === "string" ? b.question.slice(0, 400) : "";
  const lang = b.lang === "ur" ? "ur" : "en";

  switch (b.step) {
    case "brief":
      return Response.json(await seedBrief(b.product));
    case "personas":
      return Response.json({ personas: await makePersonas({ brief: brief(b.brief), scenario, question }) });
    case "round": {
      const reactions = await runRound({
        brief: brief(b.brief),
        scenario,
        question,
        personas: arr(b.personas, "personas"),
        round: b.round === 2 ? 2 : 1,
        previous: Array.isArray(b.previous) ? b.previous.slice(0, 8) : [],
      });
      return Response.json({ reactions, pull: marketPull(reactions) });
    }
    case "report": {
      const rounds = arr(b.rounds, "rounds").map((r) => arr(r, "round"));
      const report = await writeReport({
        product: String(b.product || "the product").slice(0, 80),
        brief: brief(b.brief),
        scenario,
        question,
        personas: arr(b.personas, "personas"),
        rounds,
        lang,
      });
      return Response.json({ report });
    }
    case "quick":
      return Response.json(await quickSim(String(b.product || ""), { fresh: Boolean(b.fresh) }));
    case "ease":
      return Response.json({ ease: await judgeEase({ fresh: Boolean(b.fresh) }) });
    case "rank": {
      // results come back from the browser: keep only the fields the ranking uses
      const results = arr(b.results, "results").map((r) => {
        const personas = Array.isArray(r.personas) ? r.personas.slice(0, 10) : [];
        return {
          product: String(r.product || "").slice(0, 80),
          stage: String(r.stage || "prototype").slice(0, 20),
          pull: Math.min(10, Math.max(0, Number(r.pull) || 0)),
          readiness: Math.min(10, Math.max(0, Number(r.readiness) || 5)),
          counts: decisionCounts(personas),
          personas,
          best_segment: String(r.best_segment || "").slice(0, 120),
          biggest_risk: String(r.biggest_risk || "").slice(0, 220),
        };
      });
      const ease = b.ease && typeof b.ease === "object" ? b.ease : {};
      return Response.json(await rankResults(results, ease, lang));
    }
    case "compare":
      return Response.json(await compareProducts({ lang, fresh: Boolean(b.fresh) }));
    default:
      throw new InputError("Unknown step.");
  }
});
