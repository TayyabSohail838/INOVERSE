// DELETE /api/team/:id
import { removeTeamMember } from "@/lib/store";
import { route, idFrom } from "@/lib/http";

export const DELETE = route(async (req, ctx) => {
  await removeTeamMember(await idFrom(ctx));
  return Response.json({ ok: true });
});
