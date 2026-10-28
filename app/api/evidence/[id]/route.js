// DELETE /api/evidence/:id
import { removeEvidence } from "@/lib/store";
import { route, idFrom } from "@/lib/http";

export const DELETE = route(async (req, ctx) => {
  await removeEvidence(await idFrom(ctx));
  return Response.json({ ok: true });
});
