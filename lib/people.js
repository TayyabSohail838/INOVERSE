// People you're talking to: leads, clients, partners. Inovo reads who is due a
// follow-up before every answer, and can draft the outreach message.
import { db, dbEnabled, must, COMPANY } from "@/lib/db";
import { InputError } from "@/lib/store";

export const STAGES = ["lead", "contacted", "meeting", "proposal", "client", "closed"];
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function check(result) {
  if (result.error && /relation .*contacts|relation .*whatsapp_log|schema cache/i.test(result.error.message)) {
    throw new InputError("The People tables aren't set up yet. Run supabase/people.sql in the Supabase SQL Editor.");
  }
  return must(result);
}

function requireDb() {
  if (!dbEnabled()) throw new InputError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.");
  return db();
}

// WhatsApp wants the full international number, digits only: 0300 1234567 → 923001234567.
// DEFAULT_COUNTRY_CODE (default 92, Pakistan) is used for numbers that start with 0.
export function normalisePhone(raw) {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return d.slice(1).replace(/\D/g, "");
  d = d.replace(/\D/g, "");
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return (process.env.DEFAULT_COUNTRY_CODE || "92") + d.slice(1);
  return d;
}

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function clean(input, { partial = false } = {}) {
  const row = {};
  const set = (k, v) => {
    if (!partial || input[k] !== undefined) row[k] = v;
  };
  set("name", text(input.name, 120));
  set("phone", normalisePhone(input.phone).slice(0, 20));
  set("org", text(input.org, 160));
  set("role", text(input.role, 120));
  set("notes", text(input.notes, 3000));
  set("next_followup_at", toDate(input.next_followup_at));
  if (!partial || input.stage !== undefined) {
    const stage = input.stage || "lead";
    if (!STAGES.includes(stage)) throw new InputError(`Stage must be one of: ${STAGES.join(", ")}`);
    row.stage = stage;
  }
  return row;
}

// Everyone except closed deals, follow-ups due soonest first.
export async function listContacts({ includeClosed = false } = {}) {
  if (!dbEnabled()) return [];
  let q = db().from("contacts").select("*").eq("company", COMPANY);
  if (!includeClosed) q = q.neq("stage", "closed");
  const res = await q.order("next_followup_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(300);
  if (res.error && !includeClosed) return []; // Inovo still answers if the table is missing
  return check(res) || [];
}

export async function addContact(input, source = "manual") {
  const c = requireDb();
  const row = clean(input);
  if (!row.name) throw new InputError("Give the contact a name.");
  return check(await c.from("contacts").insert({ ...row, company: COMPANY, source }).select().single());
}

export async function updateContact(id, input) {
  const c = requireDb();
  const patch = clean(input, { partial: true });
  // "I contacted them": stamp it, and move a fresh lead along
  if (input.contacted) patch.last_contacted_at = new Date().toISOString();
  return check(await c.from("contacts").update(patch).eq("company", COMPANY).eq("id", id).select().single());
}

export async function removeContact(id) {
  check(await requireDb().from("contacts").delete().eq("company", COMPANY).eq("id", id));
}

export async function getContact(id) {
  return check(await requireDb().from("contacts").select("*").eq("company", COMPANY).eq("id", id).single());
}

// Find someone by name (for the WhatsApp bot: "follow up with Ahmed Monday" updates Ahmed).
export async function findContactByName(name) {
  if (!dbEnabled() || !text(name, 120)) return null;
  const res = await db().from("contacts").select("*").eq("company", COMPANY).ilike("name", text(name, 120)).limit(1);
  return res.error ? null : res.data?.[0] || null;
}

// ---------- WhatsApp log ----------
export async function logWhatsApp(id, direction, body) {
  if (!dbEnabled()) return true;
  const res = await db().from("whatsapp_log").insert({ id, company: COMPANY, direction, text: text(body, 4000) });
  // duplicate id = WhatsApp sent the same message twice; tell the caller to skip it
  if (res.error && /duplicate key/i.test(res.error.message)) return false;
  if (res.error) console.warn("WhatsApp log:", res.error.message);
  return true;
}

export async function recentWhatsApp(limit = 10) {
  if (!dbEnabled()) return [];
  const res = await db().from("whatsapp_log").select("*").eq("company", COMPANY).order("created_at", { ascending: false }).limit(limit);
  return res.error ? [] : (res.data || []).reverse();
}

// When you last messaged the bot: WhatsApp only allows free-form replies within 24 hours of that.
export async function lastInboundAt() {
  if (!dbEnabled()) return null;
  const res = await db().from("whatsapp_log").select("created_at").eq("company", COMPANY).eq("direction", "in").order("created_at", { ascending: false }).limit(1);
  return res.data?.[0]?.created_at || null;
}
