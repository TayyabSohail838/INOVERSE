// PATCH  /api/commitments/:id { owner?, next_action?, status?, touched?: true }
// DELETE /api/commitments/:id
import { updateCommitment, removeCommitment } from "@/lib/store";
import { route, readJson, idFrom } from "@/lib/http";

export const PATCH = route(async (req, ctx) => {
  const id = await idFrom(ctx);
  return Response.json({ commitment: await updateCommitment(id, await readJson(req)) });
});

export const DELETE = route(async (req, ctx) => {
  await removeCommitment(await idFrom(ctx));
  return Response.json({ ok: true });
});
