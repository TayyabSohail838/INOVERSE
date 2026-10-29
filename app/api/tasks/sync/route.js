// POST /api/tasks/sync → check Gmail for new "Inovo" emails and turn them into tasks.
// The app calls this when it opens and every few minutes while it stays open.
import { googleConfigured, syncGmail } from "@/lib/google";
import { route } from "@/lib/http";
import { isDemo } from "@/lib/demo";

export const maxDuration = 60;

export const POST = route(async () => {
  if (isDemo() || !googleConfigured()) return Response.json({ connected: false, added: 0, checked: 0 });
  try {
    return Response.json(await syncGmail());
  } catch (err) {
    if (err.expired) return Response.json({ connected: false, expired: true, added: 0, error: err.message });
    throw err;
  }
});
