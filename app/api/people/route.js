// GET  /api/people?all=1 → contacts (all=1 includes closed), follow-ups due first
// POST /api/people { name, phone?, org?, role?, stage?, next_followup_at?, notes? }
import { listContacts, addContact } from "@/lib/people";
import { route, readJson } from "@/lib/http";
import { isDemo, demoContacts, demoReadOnly } from "@/lib/demo";

export const GET = route(async (req) => {
  if (isDemo()) return Response.json({ contacts: demoContacts(), demo: true });
  const all = new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ contacts: await listContacts({ includeClosed: all }) });
});

export const POST = route(async (req) => {
  demoReadOnly();
  return Response.json({ contact: await addContact(await readJson(req)) }, { status: 201 });
});
