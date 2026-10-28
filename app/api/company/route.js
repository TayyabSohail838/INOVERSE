// GET /api/company → { profile, team, products }
// PUT /api/company { name, about }
import { getCompany, saveProfile } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const GET = route(async () => Response.json((await getCompany()) || { profile: null, team: [], products: [] }));

export const PUT = route(async (req) => Response.json({ profile: await saveProfile(await readJson(req)) }));
