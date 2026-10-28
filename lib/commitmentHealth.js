// Ported from alirezarezvani/claude-skills — productivity/weekly-review/scripts/commitment_auditor.py (MIT)
// Input: [{ name, days_since_touched, next_action }]  (next_action: string or empty)

export const STALLED_DAYS = 14;
export const SOMEDAY_DAYS = 45;
export const FORMULA =
  "score = 100 - 30*(stalled/total) - 40*(no_next_action/total) - 30*(someday/total)";

export function auditCommitments(commitments) {
  if (!Array.isArray(commitments) || commitments.length === 0) {
    throw new Error("commitments must be a non-empty array");
  }
  const total = commitments.length;
  let stalled = 0;
  let noAction = 0;
  let someday = 0;

  const rows = commitments.map((c) => {
    const days = Number(c.days_since_touched);
    if (!Number.isFinite(days) || days < 0) {
      throw new Error(`${c.name}: days_since_touched must be a non-negative number`);
    }
    const flags = [];
    if (days > STALLED_DAYS) {
      flags.push("STALLED");
      stalled++;
    }
    if (!c.next_action || !String(c.next_action).trim()) {
      flags.push("NO-NEXT-ACTION");
      noAction++;
    }
    if (days > SOMEDAY_DAYS) {
      flags.push("SOMEDAY-CANDIDATE");
      someday++;
    }
    return { name: c.name, days_since_touched: days, flags };
  });

  let score = 100 - 30 * (stalled / total) - 40 * (noAction / total) - 30 * (someday / total);
  score = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;

  const verdict = score >= 80 ? "HEALTHY" : score >= 50 ? "DRIFTING" : "OVERCOMMITTED";

  return {
    score,
    verdict,
    formula: FORMULA,
    counts: { STALLED: stalled, "NO-NEXT-ACTION": noAction, "SOMEDAY-CANDIDATE": someday },
    rows,
  };
}
