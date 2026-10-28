// PATCH /api/experiments/:id { status?: planned|running|passed|failed, result_notes? }
// Passed or failed results are also filed as evidence for the next gap check.
import { updateExperiment } from "@/lib/store";
import { route, readJson, idFrom } from "@/lib/http";

export const PATCH = route(async (req, ctx) => {
  const id = await idFrom(ctx);
  return Response.json({ experiment: await updateExperiment(id, await readJson(req)) });
});
