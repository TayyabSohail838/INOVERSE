// Upcoming tasks: what Inovo keeps in mind before every answer.
// Tasks come from marked Gmail emails or the Tasks tab.
import { db, dbEnabled, must, COMPANY } from "@/lib/db";
import { InputError } from "@/lib/store";

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Friendly error when the tables from supabase/tasks.sql haven't been created yet.
function check(result) {
  if (result.error && /relation .*tasks|relation .*integrations|schema cache/i.test(result.error.message)) {
    throw new InputError("The tasks tables aren't set up yet. Run supabase/people.sql in the Supabase SQL Editor.");
  }
  return must(result);
}

function requireDb() {
  if (!dbEnabled()) throw new InputError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.");
  return db();
}

function toDue(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Open tasks, soonest first (tasks with no date last). includeDone adds recent finished ones.
export async function listTasks({ includeDone = false } = {}) {
  if (!dbEnabled()) return [];
  let q = db().from("tasks").select("*").eq("company", COMPANY);
  if (!includeDone) q = q.eq("status", "open");
  const res = await q.order("due_at", { ascending: true, nullsFirst: false }).order("created_at").limit(200);
  // Inovo should still answer if the tables are missing: treat as no tasks
  if (res.error && !includeDone) return [];
  return check(res) || [];
}

export async function addTask({ title, notes, due_at, source = "manual", source_id = null }) {
  const c = requireDb();
  if (!text(title, 300)) throw new InputError("Give the task a title.");
  const row = {
    company: COMPANY,
    title: text(title, 300),
    notes: text(notes, 2000),
    due_at: toDue(due_at),
    source,
    source_id,
  };
  return check(await c.from("tasks").insert(row).select().single());
}

export async function updateTask(id, { title, notes, due_at, status }) {
  const c = requireDb();
  const patch = {};
  if (title !== undefined) patch.title = text(title, 300);
  if (notes !== undefined) patch.notes = text(notes, 2000);
  if (due_at !== undefined) patch.due_at = toDue(due_at);
  if (status !== undefined) {
    if (!["open", "done"].includes(status)) throw new InputError("Status must be open or done.");
    patch.status = status;
  }
  return check(await c.from("tasks").update(patch).eq("company", COMPANY).eq("id", id).select().single());
}

export async function removeTask(id) {
  const c = requireDb();
  check(await c.from("tasks").delete().eq("company", COMPANY).eq("id", id));
}

// Which Gmail messages have already become tasks (so each email is read once).
export async function knownSourceIds(ids) {
  if (!ids.length) return new Set();
  const rows = check(await requireDb().from("tasks").select("source_id").eq("company", COMPANY).in("source_id", ids));
  return new Set((rows || []).map((r) => r.source_id));
}

// ---------- Google connection ----------
export async function getIntegration(provider) {
  if (!dbEnabled()) return null;
  return check(await db().from("integrations").select("*").eq("company", COMPANY).eq("provider", provider).maybeSingle());
}

export async function saveIntegration(provider, { account, refresh_token, scopes = "" }) {
  const c = requireDb();
  const row = { company: COMPANY, provider, account: text(account, 200), refresh_token, scopes };
  let res = await c.from("integrations").upsert(row, { onConflict: "company,provider" }).select().single();
  if (res.error && /scopes/i.test(res.error.message)) {
    // supabase/people.sql not run yet: save without the scopes column (calendar stays off)
    delete row.scopes;
    res = await c.from("integrations").upsert(row, { onConflict: "company,provider" }).select().single();
  }
  return check(res);
}

export async function markSynced(provider) {
  check(
    await requireDb()
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("company", COMPANY)
      .eq("provider", provider)
  );
}

export async function removeIntegration(provider) {
  check(await requireDb().from("integrations").delete().eq("company", COMPANY).eq("provider", provider));
}
