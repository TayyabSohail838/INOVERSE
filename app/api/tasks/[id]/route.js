// PATCH  /api/tasks/:id { title?, notes?, due_at?, status?: "open" | "done" }
// DELETE /api/tasks/:id
import { updateTask, removeTask } from "@/lib/tasks";
import { route, readJson, idFrom } from "@/lib/http";

export const PATCH = route(async (req, ctx) => {
  const id = await idFrom(ctx);
  return Response.json({ task: await updateTask(id, await readJson(req)) });
});

export const DELETE = route(async (req, ctx) => {
  await removeTask(await idFrom(ctx));
  return Response.json({ ok: true });
});
