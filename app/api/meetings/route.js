// GET /api/meetings?fresh=1 → your Google Calendar meetings in the next 7 days
import { upcomingMeetings } from "@/lib/google";
import { route } from "@/lib/http";
import { isDemo, demoMeetings } from "@/lib/demo";

export const GET = route(async (req) => {
  if (isDemo()) return Response.json(demoMeetings());
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    return Response.json(await upcomingMeetings({ fresh }));
  } catch (err) {
    return Response.json({ connected: true, granted: true, meetings: [], error: err.message });
  }
});
