// GET  /api/tasks?all=1  → open tasks, soonest first (all=1 adds finished ones)
// POST /api/tasks { title, notes?, due_at? }
import { listTasks, addTask } from "@/lib/tasks";
import { route, readJson } from "@/lib/http";

export const GET = route(async (req) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ tasks: await listTasks({ includeDone: all }) });
});

export const POST = route(async (req) => {
  const { title, notes, due_at } = await readJson(req);
  return Response.json({ task: await addTask({ title, notes, due_at, source: "manual" }) }, { status: 201 });
});
