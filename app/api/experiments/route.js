// GET /api/experiments → the 48-hour tests created by gap checks, plus gap-check history
import { listExperiments, listGapChecks } from "@/lib/store";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const [experiments, gapChecks] = await Promise.all([listExperiments(), listGapChecks()]);
  return Response.json({ experiments, gapChecks });
});
