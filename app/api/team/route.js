// POST /api/team { name, role }
import { addTeamMember } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const POST = route(async (req) => Response.json({ member: await addTeamMember(await readJson(req)) }, { status: 201 }));
