// POST /api/people/:id/draft { goal?, lang? } → { message, whatsappUrl }
// Inovo writes a short WhatsApp message to this person, using what it knows about them
// and the company. You edit it if you like, then one tap opens WhatsApp with it typed.
import { gemma } from "@/lib/gemma";
import { buildContext } from "@/lib/context";
import { getContact } from "@/lib/people";
import { isDemo, demoContacts } from "@/lib/demo";
import { InputError } from "@/lib/store";
import { route, readJson, idFrom } from "@/lib/http";

export const POST = route(async (req, ctx) => {
  const id = await idFrom(ctx);
  const { goal = "", lang = "en" } = await readJson(req).catch(() => ({}));
  const findDemo = () => {
    const d = demoContacts().find((x) => x.id === id);
    if (!d) throw new InputError("Contact not found.");
    return d;
  };
  const [c, context] = await Promise.all([isDemo() ? findDemo() : getContact(id), buildContext()]);

  const out = await gemma(
    `Write ONE WhatsApp message from the founder to this person.

PERSON: ${c.name}${c.role ? `, ${c.role}` : ""}${c.org ? ` at ${c.org}` : ""}
STAGE: ${c.stage}${c.last_contacted_at ? ` (last contacted ${c.last_contacted_at.slice(0, 10)})` : " (never contacted yet)"}
NOTES: ${c.notes || "none"}
GOAL: ${goal || (c.stage === "lead" ? "a warm first message that earns a reply" : "a friendly follow-up that moves things one step forward")}

Rules: sound like a real person in Pakistan writing on WhatsApp, not a marketing email. 2-5 short sentences.
Use their first name. One clear ask (a call, a visit, a reply). No hashtags, no emojis overload, no placeholders like [Name].
${lang === "ur" ? "Write it in simple Roman Urdu mixed with English, the way people actually text." : "Write it in simple English."}
Reply with ONLY JSON: {"message": "..."}`,
    { system: `You are Inovo, the founder's AI cofounder.\n\n# COMPANY CONTEXT\n${context}`, temperature: 0.6, json: true, fast: true }
  );
  const message = String(out?.message || "").trim();
  const whatsappUrl = c.phone ? `https://wa.me/${c.phone}?text=${encodeURIComponent(message)}` : null;
  return Response.json({ message, whatsappUrl });
});
