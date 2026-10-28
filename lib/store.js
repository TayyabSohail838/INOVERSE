// All database reads and writes in one place. Every function is safe to call
// without Supabase configured: writes are skipped and reads return empty lists.
import { db, dbEnabled, must, COMPANY } from "@/lib/db";

const EVIDENCE_KINDS = ["customer", "competitor", "price", "research", "test_result", "other"];
const EXPERIMENT_STATUSES = ["planned", "running", "passed", "failed"];
const COMMITMENT_STATUSES = ["active", "someday", "done", "dropped"];

const text = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export class InputError extends Error {}

function requireDb() {
  if (!dbEnabled()) throw new InputError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local.");
  return db();
}

// ---------- company ----------
export async function getCompany() {
  if (!dbEnabled()) return null;
  const c = db();
  const [profile, team, products] = await Promise.all([
    c.from("company_profile").select("*").eq("company", COMPANY).maybeSingle(),
    c.from("team_members").select("*").eq("company", COMPANY).order("created_at"),
    c.from("products").select("*").eq("company", COMPANY).order("created_at"),
  ]);
  return { profile: must(profile), team: must(team) || [], products: must(products) || [] };
}

export async function saveProfile({ name, about }) {
  const c = requireDb();
  if (!text(name, 200)) throw new InputError("Company name is required.");
  return must(
    await c
      .from("company_profile")
      .upsert({ company: COMPANY, name: text(name, 200), about: text(about, 8000), updated_at: new Date().toISOString() })
      .select()
      .single()
  );
}

export async function addTeamMember({ name, role }) {
  const c = requireDb();
  if (!text(name, 100)) throw new InputError("Name is required.");
  return must(await c.from("team_members").insert({ company: COMPANY, name: text(name, 100), role: text(role, 200) }).select().single());
}

export async function removeTeamMember(id) {
  const c = requireDb();
  must(await c.from("team_members").delete().eq("company", COMPANY).eq("id", id));
}

export async function addProduct({ name, description, stage }) {
  const c = requireDb();
  if (!text(name, 120)) throw new InputError("Product name is required.");
  return must(
    await c
      .from("products")
      .insert({ company: COMPANY, name: text(name, 120), description: text(description, 1000), stage: text(stage, 40) || "idea" })
      .select()
      .single()
  );
}

export async function updateProduct(id, { description, stage }) {
  const c = requireDb();
  const patch = {};
  if (description !== undefined) patch.description = text(description, 1000);
  if (stage !== undefined) patch.stage = text(stage, 40) || "idea";
  return must(await c.from("products").update(patch).eq("company", COMPANY).eq("id", id).select().single());
}

export async function removeProduct(id) {
  const c = requireDb();
  must(await c.from("products").delete().eq("company", COMPANY).eq("id", id));
}

// ---------- evidence ----------
export async function listEvidence(limit = 50) {
  if (!dbEnabled()) return [];
  return must(await db().from("evidence").select("*").eq("company", COMPANY).order("created_at", { ascending: false }).limit(limit)) || [];
}

export async function addEvidence({ kind, title, content, product, source }) {
  const c = requireDb();
  if (!text(content)) throw new InputError("Evidence needs some content.");
  const row = {
    company: COMPANY,
    kind: EVIDENCE_KINDS.includes(kind) ? kind : "other",
    title: text(title, 200),
    content: text(content),
    product: text(product, 120) || null,
    source: text(source, 300) || null,
  };
  return must(await c.from("evidence").insert(row).select().single());
}

export async function removeEvidence(id) {
  const c = requireDb();
  must(await c.from("evidence").delete().eq("company", COMPANY).eq("id", id));
}

// ---------- commitments ----------
export async function listCommitments({ includeClosed = false } = {}) {
  if (!dbEnabled()) return [];
  let q = db().from("commitments").select("*").eq("company", COMPANY);
  if (!includeClosed) q = q.in("status", ["active", "someday"]);
  return must(await q.order("created_at")) || [];
}

export async function addCommitment({ name, owner, next_action }) {
  const c = requireDb();
  if (!text(name, 200)) throw new InputError("Give the commitment a name.");
  return must(
    await c
      .from("commitments")
      .insert({ company: COMPANY, name: text(name, 200), owner: text(owner, 100), next_action: text(next_action, 500) })
      .select()
      .single()
  );
}

export async function updateCommitment(id, { owner, next_action, status, touched }) {
  const c = requireDb();
  const patch = {};
  if (owner !== undefined) patch.owner = text(owner, 100);
  if (next_action !== undefined) patch.next_action = text(next_action, 500);
  if (status !== undefined) {
    if (!COMMITMENT_STATUSES.includes(status)) throw new InputError(`Status must be one of: ${COMMITMENT_STATUSES.join(", ")}`);
    patch.status = status;
  }
  // Any real change (or an explicit "worked on it") counts as touching it
  if (Object.keys(patch).length || touched) patch.last_touched_at = new Date().toISOString();
  return must(await c.from("commitments").update(patch).eq("company", COMPANY).eq("id", id).select().single());
}

export async function removeCommitment(id) {
  const c = requireDb();
  must(await c.from("commitments").delete().eq("company", COMPANY).eq("id", id));
}

// ---------- messages ----------
export async function saveMessages(rows) {
  if (!dbEnabled()) return;
  const data = rows.map((r) => ({ company: COMPANY, role: r.role, text: text(r.text, 20000), skill: r.skill || null }));
  must(await db().from("messages").insert(data));
}

export async function recentMessages(limit = 30) {
  if (!dbEnabled()) return [];
  const rows = must(await db().from("messages").select("*").eq("company", COMPANY).order("created_at", { ascending: false }).limit(limit)) || [];
  return rows.reverse();
}

// ---------- gap checks + experiments ----------
export async function saveGapCheck(idea, result) {
  if (!dbEnabled()) return { gapCheckId: null, experimentId: null };
  const c = db();
  const { brief, panel, verdict, test } = result.gapCheck;
  const gap = must(
    await c
      .from("gap_checks")
      .insert({ company: COMPANY, idea: text(idea, 2000), brief, panel, verdict, test, write_up: text(result.details, 20000) })
      .select()
      .single()
  );
  // Every gap check creates its 48-hour test, ready to run
  const exp = must(
    await c
      .from("experiments")
      .insert({
        company: COMPANY,
        gap_check_id: gap.id,
        name: `${test.name}: ${text(brief?.idea || idea, 120)}`,
        plan: test.do,
        pass_line: test.pass,
      })
      .select()
      .single()
  );
  return { gapCheckId: gap.id, experimentId: exp.id };
}

export async function listGapChecks(limit = 20) {
  if (!dbEnabled()) return [];
  return (
    must(
      await db()
        .from("gap_checks")
        .select("id, idea, verdict, test, created_at")
        .eq("company", COMPANY)
        .order("created_at", { ascending: false })
        .limit(limit)
    ) || []
  );
}

export async function listExperiments(limit = 50) {
  if (!dbEnabled()) return [];
  return must(await db().from("experiments").select("*").eq("company", COMPANY).order("created_at", { ascending: false }).limit(limit)) || [];
}

// Logging a pass/fail result also files it as evidence, so the next gap check knows.
export async function updateExperiment(id, { status, result_notes }) {
  const c = requireDb();
  const patch = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    if (!EXPERIMENT_STATUSES.includes(status)) throw new InputError(`Status must be one of: ${EXPERIMENT_STATUSES.join(", ")}`);
    patch.status = status;
  }
  if (result_notes !== undefined) patch.result_notes = text(result_notes);
  const exp = must(await c.from("experiments").update(patch).eq("company", COMPANY).eq("id", id).select().single());

  if (status === "passed" || status === "failed") {
    await addEvidence({
      kind: "test_result",
      title: `Test ${status}: ${exp.name}`,
      content: `Pass line: ${exp.pass_line}\nResult: ${status.toUpperCase()}\nNotes: ${exp.result_notes || "none"}`,
      source: "48-hour test",
    });
  }
  return exp;
}

// ---------- weekly reviews ----------
export async function saveWeeklyReview({ updates, health, output }) {
  if (!dbEnabled()) return null;
  return must(await db().from("weekly_reviews").insert({ company: COMPANY, updates: text(updates, 20000), health, output }).select().single());
}

export async function listWeeklyReviews(limit = 10) {
  if (!dbEnabled()) return [];
  return must(await db().from("weekly_reviews").select("*").eq("company", COMPANY).order("created_at", { ascending: false }).limit(limit)) || [];
}
