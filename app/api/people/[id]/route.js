// PATCH  /api/people/:id { any field, contacted?: true }
// DELETE /api/people/:id
import { updateContact, removeContact } from "@/lib/people";
import { route, readJson, idFrom } from "@/lib/http";
import { demoReadOnly } from "@/lib/demo";

export const PATCH = route(async (req, ctx) => {
  demoReadOnly();
  const id = await idFrom(ctx);
  return Response.json({ contact: await updateContact(id, await readJson(req)) });
});

export const DELETE = route(async (req, ctx) => {
  demoReadOnly();
  await removeContact(await idFrom(ctx));
  return Response.json({ ok: true });
});
