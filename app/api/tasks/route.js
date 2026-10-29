// GET  /api/tasks?all=1  → open tasks, soonest first (all=1 adds finished ones)
// POST /api/tasks { title, notes?, due_at? }
// On the public demo: Inovix sample tasks, and nothing is saved.
import { listTasks, addTask } from "@/lib/tasks";
import { isDemo, demoTasks, demoReadOnly } from "@/lib/demo";
import { route, readJson } from "@/lib/http";

export const GET = route(async (req) => {
  if (isDemo()) return Response.json({ tasks: demoTasks(), demo: true });
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ tasks: await listTasks({ includeDone: all }) });
});

export const POST = route(async (req) => {
  demoReadOnly();
  const { title, notes, due_at } = await readJson(req);
  return Response.json({ task: await addTask({ title, notes, due_at, source: "manual" }) }, { status: 201 });
});
