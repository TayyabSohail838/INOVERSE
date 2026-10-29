"use client";
// Evidence, Tests, Weekly review and Company tabs. Each reads and writes through /api.
import { useCallback, useEffect, useState } from "react";
import { api, cached } from "@/lib/api";

const shortDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const daysSince = (d) => Math.max(0, Math.floor((Date.now() - Date.parse(d)) / 864e5));

function NeedsDb({ what }) {
  return (
    <div className="empty">
      <p>Connect Supabase to keep {what}.</p>
      <p className="muted">The setup takes about five minutes. Follow “Connect Supabase” in the README, then reload this page.</p>
    </div>
  );
}

function useList(path, key, enabled) {
  const [items, setItems] = useState(() => cached(path)?.[key] || []);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const d = await api(path);
      setItems(d[key] || []);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
    }
  }, [path, key]);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { items, setItems, error, setError, load };
}

// ---------------- Evidence ----------------
const KINDS = [
  ["customer", "Customer conversation"],
  ["competitor", "Competitor"],
  ["price", "Price someone pays"],
  ["research", "Research paper"],
  ["test_result", "Test result"],
  ["other", "Other"],
];
const kindName = (k) => (KINDS.find(([v]) => v === k) || [k, k])[1];

export function EvidencePanel({ dbReady }) {
  const { items, setItems, error, setError, load } = useList("/api/evidence", "evidence", dbReady);
  const [form, setForm] = useState({ kind: "customer", title: "", content: "", product: "" });
  const [busy, setBusy] = useState(false);
  if (!dbReady) return <NeedsDb what="evidence" />;

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/evidence", { method: "POST", body: form });
      setForm((f) => ({ ...f, title: "", content: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api(`/api/evidence/${id}`, { method: "DELETE" });
      setItems((x) => x.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <p className="lead">
        The gap check only trusts what you write here. Log real customer conversations, prices and competitors after
        every call or visit.
      </p>
      <form className="card form" onSubmit={add}>
        <div className="row">
          <label>
            Type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Product
            <input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Fabriq AI" />
          </label>
        </div>
        <label>
          Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Call with a 40-loom mill owner" />
        </label>
        <label>
          What you learned
          <textarea rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="They check fabric by hand. Would try a 2-week pilot if setup takes under a day." />
        </label>
        <button className="btn" disabled={busy || !form.content.trim()}>Add evidence</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {items.length === 0 ? (
        <p className="muted">No evidence yet. Your first customer conversation goes here.</p>
      ) : (
        <ul className="list">
          {items.map((e) => (
            <li key={e.id} className="card">
              <div className="item-head">
                <span className={`kind k-${e.kind}`}>{kindName(e.kind)}</span>
                <span className="muted">{shortDate(e.created_at)}{e.product ? `, ${e.product}` : ""}</span>
              </div>
              {e.title && <p className="item-title">{e.title}</p>}
              <p className="pre">{e.content}</p>
              <button className="link danger" onClick={() => remove(e.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Tests ----------------
const STATUSES = [
  ["planned", "Planned"],
  ["running", "Running"],
  ["passed", "Passed"],
  ["failed", "Failed"],
];

export function TestsPanel({ dbReady }) {
  const [data, setData] = useState(() => cached("/api/experiments") || { experiments: [], gapChecks: [] });
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api("/api/experiments"));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (dbReady) load();
  }, [dbReady, load]);
  if (!dbReady) return <NeedsDb what="your 48-hour tests" />;

  const draftOf = (x) => drafts[x.id] || { status: x.status, result_notes: x.result_notes };

  async function save(x) {
    setError("");
    try {
      await api(`/api/experiments/${x.id}`, { method: "PATCH", body: draftOf(x) });
      const s = draftOf(x).status;
      setSaved(s === "passed" || s === "failed" ? "Result saved and added to Evidence." : "Saved.");
      setDrafts((d) => {
        const n = { ...d };
        delete n[x.id];
        return n;
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="stack">
      <p className="lead">
        Every gap check creates one cheap real-world test. Run it, then log what happened. Results feed the next gap
        check.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="ok" role="status">{saved}</p>}
      {data.experiments.length === 0 ? (
        <p className="muted">No tests yet. Ask Inovo to check the gaps on an idea.</p>
      ) : (
        <ul className="list">
          {data.experiments.map((x) => {
            const d = draftOf(x);
            return (
              <li key={x.id} className={`card test-card st-${x.status}`}>
                <p className="item-title">{x.name}</p>
                <p>{x.plan}</p>
                <p className="muted">Passes if: {x.pass_line}</p>
                <div className="row">
                  <label>
                    Status
                    <select value={d.status} onChange={(e) => setDrafts({ ...drafts, [x.id]: { ...d, status: e.target.value } })}>
                      {STATUSES.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  What happened
                  <textarea rows={2} value={d.result_notes} onChange={(e) => setDrafts({ ...drafts, [x.id]: { ...d, result_notes: e.target.value } })} placeholder="3 owners messaged, 1 agreed to a paid pilot" />
                </label>
                <button className="btn quiet" onClick={() => save(x)} disabled={!drafts[x.id]}>Save result</button>
              </li>
            );
          })}
        </ul>
      )}
      {data.gapChecks.length > 0 && (
        <>
          <h2>Past gap checks</h2>
          <ul className="list compact">
            {data.gapChecks.map((g) => (
              <li key={g.id} className="history">
                <span className={`pill v-${(g.verdict?.verdict || "").toLowerCase()}`}>{g.verdict?.verdict}</span>
                <span className="history-idea">{g.idea}</span>
                <span className="muted">{shortDate(g.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------- Weekly review ----------------
const C_STATUS = [
  ["active", "Active"],
  ["someday", "Someday"],
  ["done", "Done"],
  ["dropped", "Dropped"],
];

export function WeeklyPanel({ dbReady, lang, onSpeak }) {
  const { items, setItems, error, setError, load } = useList("/api/commitments", "commitments", dbReady);
  const [form, setForm] = useState({ name: "", owner: "", next_action: "" });
  const [adding, setAdding] = useState(false);
  const [updates, setUpdates] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  if (!dbReady) return <NeedsDb what="commitments and weekly reviews" />;

  async function add(e) {
    e.preventDefault();
    if (adding) return; // one at a time, so a double click can't add it twice
    setAdding(true);
    try {
      const r = await api("/api/commitments", { method: "POST", body: form });
      if (r.commitment) setItems((xs) => [...xs, r.commitment]);
      setForm({ name: "", owner: "", next_action: "" });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function patch(id, body) {
    try {
      await api(`/api/commitments/${id}`, { method: "PATCH", body });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    try {
      await api(`/api/commitments/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function run(e) {
    e.preventDefault();
    setRunning(true);
    setError("");
    try {
      const d = await api("/api/weekly-review", { method: "POST", body: { updates, lang } });
      setResult(d);
      if (d.review?.say) onSpeak?.(d.review.say);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const r = result?.review;
  const h = result?.health;

  return (
    <div className="stack">
      <h2>Commitments</h2>
      <p className="lead">Anything the team has promised. Each needs one owner and one next action.</p>
      {items.length === 0 ? (
        <p className="muted">Nothing tracked yet. Add your first commitment below.</p>
      ) : (
        <ul className="list">
          {items.map((c) => {
            const days = daysSince(c.last_touched_at);
            return (
              <li key={c.id} className={`card commit ${days > 14 ? "stalled" : ""}`}>
                <div className="item-head">
                  <p className="item-title">{c.name}</p>
                  <span className="muted">{days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}</span>
                </div>
                <p className={c.next_action ? "" : "warn"}>{c.next_action ? `Next: ${c.next_action}` : "No next action"}</p>
                <p className="muted">Owner: {c.owner || "nobody yet"}</p>
                <div className="row actions">
                  <select aria-label={`Status of ${c.name}`} value={c.status} onChange={(e) => patch(c.id, { status: e.target.value })}>
                    {C_STATUS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <button className="btn quiet" onClick={() => patch(c.id, { touched: true })}>Worked on it</button>
                  <button className="link danger" onClick={() => remove(c.id)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="card form" onSubmit={add}>
        <label>
          Commitment
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fabriq pilot with one mill" />
        </label>
        <div className="row">
          <label>
            Owner
            <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Tayyab" />
          </label>
          <label>
            Next action
            <input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} placeholder="Call 3 mill owners" />
          </label>
        </div>
        <button className="btn quiet" disabled={adding || !form.name.trim()}>{adding ? "Adding…" : "Add commitment"}</button>
      </form>

      <h2>Run the weekly review</h2>
      <form className="card form" onSubmit={run}>
        <label>
          This week's updates
          <textarea rows={5} value={updates} onChange={(e) => setUpdates(e.target.value)} placeholder={"Tayyab: called 2 mills, one wants a demo.\nTeammate: stuck on the dashboard bug."} />
        </label>
        <button className="btn" disabled={running || !updates.trim()}>{running ? "Reviewing" : "Run weekly review"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {r && (
        <div className="card review">
          {h && (
            <p className={`health h-${h.verdict.toLowerCase()}`}>
              <strong>{h.score}</strong> {h.verdict.charAt(0) + h.verdict.slice(1).toLowerCase()}
            </p>
          )}
          {r.one_goal_this_week && (
            <p className="goal">This week: {r.one_goal_this_week}</p>
          )}
          {r.tasks?.length > 0 && (
            <ul className="tasks">
              {r.tasks.map((t, i) => (
                <li key={i}>
                  <b>{t.owner}</b> {t.task} {t.day && <span className="muted">by {t.day}</span>}
                </li>
              ))}
            </ul>
          )}
          {r.stalled?.length > 0 && (
            <>
              <p className="item-title">Stalled</p>
              <ul className="tasks">
                {r.stalled.map((s, i) => (
                  <li key={i}>
                    {s.item}: {s.why} <span className="muted">Suggest: {s.suggestion}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Company ----------------
const STAGES = ["idea", "prototype", "pilot", "live", "paying", "paused"];

export function CompanyPanel({ dbReady }) {
  const first = cached("/api/company");
  const [data, setData] = useState(first || null);
  const [profile, setProfile] = useState({ name: first?.profile?.name || "", about: first?.profile?.about || "" });
  const [member, setMember] = useState({ name: "", role: "" });
  const [product, setProduct] = useState({ name: "", description: "", stage: "idea" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(""); // what is saving right now, e.g. "team"

  const load = useCallback(async () => {
    try {
      const d = await api("/api/company");
      setData(d);
      return d;
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (!dbReady) return;
    // fill the form from the server, unless the founder is already typing in it
    load().then((d) => d && setProfile((p) => (p.name || p.about ? p : { name: d.profile?.name || "", about: d.profile?.about || "" })));
  }, [dbReady, load]);
  if (!dbReady) return <NeedsDb what="your company details" />;

  // Save one change. The screen updates as soon as the server says yes (apply), then
  // re-reads everything quietly in the background. One save at a time, so a double
  // click can't add the same person twice.
  const call = async (what, fn, { msg, apply } = {}) => {
    if (busy) return false;
    setBusy(what);
    setError("");
    setSaved("");
    try {
      const r = await fn();
      if (apply) setData((d) => (d ? apply(d, r) : d));
      if (msg) setSaved(msg);
      load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="stack">
      <p className="lead">Everything here is read by Inovo before every answer. Keep it current.</p>
      {(error || saved) && (
        <p className={`flash ${error ? "error" : "ok"}`} role={error ? "alert" : "status"}>
          {error || saved}
        </p>
      )}

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          call("profile", () => api("/api/company", { method: "PUT", body: profile }), {
            msg: "Company details saved.",
            apply: (d, r) => ({ ...d, profile: r.profile || d.profile }),
          });
        }}
      >
        <label>
          Company name
          <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        </label>
        <label>
          About the company
          <textarea rows={6} value={profile.about} onChange={(e) => setProfile({ ...profile, about: e.target.value })} placeholder="What you do, who you sell to, how you make money, what stage you're at" />
        </label>
        <button className="btn quiet" disabled={!!busy || !profile.name.trim()}>{busy === "profile" ? "Saving…" : "Save company details"}</button>
      </form>

      <h2>Team</h2>
      <ul className="list compact">
        {(data?.team || []).map((m) => (
          <li key={m.id} className="history">
            <span className="item-title">{m.name}</span>
            <span className="muted">{m.role}</span>
            <button
              className="link danger"
              disabled={!!busy}
              onClick={() =>
                call("team", () => api(`/api/team/${m.id}`, { method: "DELETE" }), {
                  msg: `${m.name} removed.`,
                  apply: (d) => ({ ...d, team: d.team.filter((x) => x.id !== m.id) }),
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call("team", () => api("/api/team", { method: "POST", body: member }), {
            msg: `${member.name.trim()} added to the team.`,
            apply: (d, r) => ({ ...d, team: [...d.team, r.member] }),
          });
          if (ok) setMember({ name: "", role: "" });
        }}
      >
        <label>
          Name
          <input value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} />
        </label>
        <label>
          Role
          <input value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })} placeholder="Full-stack" />
        </label>
        <button className="btn quiet" disabled={!!busy || !member.name.trim()}>{busy === "team" ? "Adding…" : "Add"}</button>
      </form>

      <h2>Products</h2>
      <ul className="list compact">
        {(data?.products || []).map((p) => (
          <li key={p.id} className="history">
            <span className="item-title">{p.name}</span>
            <select
              aria-label={`Stage of ${p.name}`}
              value={p.stage}
              disabled={!!busy}
              onChange={(e) => {
                const stage = e.target.value;
                const setStage = (d, s) => ({ ...d, products: d.products.map((x) => (x.id === p.id ? { ...x, stage: s } : x)) });
                const before = p.stage;
                setData((d) => setStage(d, stage)); // show the new stage straight away
                call("product", () => api(`/api/products/${p.id}`, { method: "PATCH", body: { stage } }), {
                  msg: `${p.name} is now ${stage}.`,
                }).then((ok) => ok || setData((d) => setStage(d, before)));
              }}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              className="link danger"
              disabled={!!busy}
              onClick={() =>
                call("product", () => api(`/api/products/${p.id}`, { method: "DELETE" }), {
                  msg: `${p.name} removed.`,
                  apply: (d) => ({ ...d, products: d.products.filter((x) => x.id !== p.id) }),
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call("newProduct", () => api("/api/products", { method: "POST", body: product }), {
            msg: `${product.name.trim()} added.`,
            apply: (d, r) => ({ ...d, products: [...d.products, r.product] }),
          });
          if (ok) setProduct({ name: "", description: "", stage: "idea" });
        }}
      >
        <div className="row">
          <label>
            Product
            <input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} />
          </label>
          <label>
            Stage
            <select value={product.stage} onChange={(e) => setProduct({ ...product, stage: e.target.value })}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          What it does
          <input value={product.description} onChange={(e) => setProduct({ ...product, description: e.target.value })} />
        </label>
        <button className="btn quiet" disabled={!!busy || !product.name.trim()}>{busy === "newProduct" ? "Adding…" : "Add product"}</button>
      </form>
    </div>
  );
}
