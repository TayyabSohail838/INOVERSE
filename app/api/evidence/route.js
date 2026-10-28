// GET  /api/evidence           → list (newest first)
// POST /api/evidence { kind, title, content, product?, source? }
import { listEvidence, addEvidence } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const GET = route(async () => Response.json({ evidence: await listEvidence(100) }));

export const POST = route(async (req) => Response.json({ evidence: await addEvidence(await readJson(req)) }, { status: 201 }));
