// GET  /api/commitments?all=1   → active + someday (all=1 includes done/dropped)
// POST /api/commitments { name, owner?, next_action? }
import { listCommitments, addCommitment } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const GET = route(async (req) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ commitments: await listCommitments({ includeClosed: all }) });
});

export const POST = route(async (req) => Response.json({ commitment: await addCommitment(await readJson(req)) }, { status: 201 }));
