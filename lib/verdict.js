// Ported from alirezarezvani/claude-skills — productivity/roast/scripts/verdict_synthesizer.py (MIT)
// Collapses the 5 panel scores into GO / RESHAPE / KILL. Pure arithmetic: no LLM call.

export const WEIGHTS = {
  customer: 0.3,
  critic: 0.25,
  investigator: 0.2,
  analyst: 0.15,
  champion: 0.1,
};

const LABEL = {
  customer: "Customer",
  critic: "Critic",
  investigator: "Investigator",
  analyst: "Analyst",
  champion: "Champion",
};

export function synthesizeVerdict(scores) {
  for (const key of Object.keys(WEIGHTS)) {
    const v = scores[key];
    if (typeof v !== "number" || v < 1 || v > 10) {
      throw new Error(`${key} score must be a number from 1 to 10`);
    }
  }

  const composite =
    Math.round(
      Object.keys(WEIGHTS).reduce((sum, k) => sum + scores[k] * WEIGHTS[k], 0) * 100
    ) / 100;

  // Hard gates: a single dimension can veto a GO
  const gates = [];
  if (scores.customer <= 3) gates.push("DEMAND GATE: the Customer would not pay.");
  if (scores.critic <= 2) gates.push("FATAL-FLAW GATE: the Critic's attack landed.");
  if (scores.analyst <= 2) gates.push("BROKEN-LOGIC GATE: the mechanism doesn't hold.");

  let verdict = composite >= 7 ? "GO" : composite >= 4.5 ? "RESHAPE" : "KILL";

  // Gates can only downgrade, never upgrade
  let gateDowngraded = false;
  if (gates.length && verdict === "GO") {
    verdict = "RESHAPE";
    gateDowngraded = true;
  }
  if (scores.customer <= 2 && composite < 4.5) verdict = "KILL";
  if (scores.critic <= 2 && composite < 4.0) verdict = "KILL";

  // Biggest disagreement = the tension the Judge must resolve
  const keys = Object.keys(WEIGHTS);
  const hi = keys.reduce((a, b) => (scores[b] > scores[a] ? b : a));
  const lo = keys.reduce((a, b) => (scores[b] < scores[a] ? b : a));
  const spread = scores[hi] - scores[lo];
  const tension =
    spread >= 4
      ? `${LABEL[hi]} (${scores[hi]}) vs ${LABEL[lo]} (${scores[lo]}): resolve this in the write-up.`
      : null;

  let confidence = spread <= 2 ? "high" : spread <= 5 ? "medium" : "low";
  if (gateDowngraded && confidence === "high") confidence = "medium";

  return { verdict, confidence, composite, gates, tension, gateDowngraded, scores };
}
