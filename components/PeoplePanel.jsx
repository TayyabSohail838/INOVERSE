"use client";
// People: leads, clients and partners, with a follow-up date for each.
// Inovo drafts the message; one tap opens WhatsApp with it already typed.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const STAGES = [
  ["lead", "Lead"],
  ["contacted", "Contacted"],
  ["meeting", "Meeting"],
  ["proposal", "Proposal sent"],
  ["client", "Client"],
  ["closed", "Closed"],
];
const stageName = (s) => (STAGES.find(([v]) => v === s) || [s, s])[1];
const DAY = 864e5;

// date input value (YYYY-MM-DD) ↔ stored timestamp (end of that day, local time)
const toInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromInput = (v) => (v ? new Date(`${v}T23:59:00`).toISOString() : null);
const inDays = (n) => fromInput(toInput(new Date(Date.now() + n * DAY).toISOString()));

function followText(iso) {
  if (!iso) return { text: "No follow-up set", cls: "" };
  const d = new Date(iso);
  const days = Math.round((new Date(toInput(iso)) - new Date(toInput(new Date().toISOString()))) / DAY);
  if (days < 0) return { text: `Follow-up overdue by ${-days} day${days === -1 ? "" : "s"}`, cls: "k-overdue" };
  if (days === 0) return { text: "Follow up today", cls: "k-today" };
  if (days === 1) return { text: "Follow up tomorrow", cls: "" };
  return { text: `Follow up ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`, cls: "" };
}

const EMPTY = { name: "", phone: "", org: "", role: "", stage: "lead", followup: "", notes: "" };

export default function PeoplePanel({ dbReady, lang }) {
  const [people, setPeople] = useState([]);
  const [filter, setFilter] = useState("due");
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState({}); // id → { loading, message }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false); // public link: sample people, read-only

  const load = useCallback(async () => {
    try {
      const d = await api("/api/people?all=1");
      setPeople(d.contacts || []);
      setDemo(Boolean(d.demo));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (dbReady) load();
  }, [dbReady, load]);

  if (!dbReady) {
    return (
      <div className="empty">
        <p>Connect Supabase to keep your contacts.</p>
        <p className="muted">Follow “Connect Supabase” in the README, then reload this page.</p>
      </div>
    );
  }

  const endOfToday = new Date(`${toInput(new Date().toISOString())}T23:59:59`).getTime();
  const isDue = (c) => c.stage !== "closed" && c.next_followup_at && Date.parse(c.next_followup_at) <= endOfToday;
  const dueCount = people.filter(isDue).length;
  const shown = people.filter((c) =>
    filter === "due" ? isDue(c) : filter === "all" ? c.stage !== "closed" : c.stage === filter
  );

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/people", {
        method: "POST",
        body: { ...form, next_followup_at: fromInput(form.followup) },
      });
      setForm(EMPTY);
      setAdding(false);
      setFilter("all");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id, body) {
    try {
      const { contact } = await api(`/api/people/${id}`, { method: "PATCH", body });
      setPeople((xs) => xs.map((x) => (x.id === id ? contact : x)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await api(`/api/people/${c.id}`, { method: "DELETE" });
      setPeople((xs) => xs.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function draft(c) {
    setDrafts((d) => ({ ...d, [c.id]: { loading: true, message: d[c.id]?.message || "" } }));
    try {
      const r = await api(`/api/people/${c.id}/draft`, { method: "POST", body: { lang } });
      setDrafts((d) => ({ ...d, [c.id]: { loading: false, message: r.message } }));
    } catch (err) {
      setDrafts((d) => ({ ...d, [c.id]: { loading: false, message: d[c.id]?.message || "" } }));
      setError(err.message);
    }
  }

  // after sending: stamp it, move a lead to "contacted", and set the next follow-up in 3 days
  const markContacted = (c) =>
    patch(c.id, { contacted: true, stage: c.stage === "lead" ? "contacted" : c.stage, next_followup_at: inDays(3) });

  return (
    <div className="stack">
      <p className="lead">
        Everyone you're talking to. Inovo reminds you who to follow up with, and you can also add people by texting Inovo on
        WhatsApp.
      </p>

      <div className="chips" role="group" aria-label="Show">
        <button aria-pressed={filter === "due"} onClick={() => setFilter("due")}>
          Due{dueCount ? ` (${dueCount})` : ""}
        </button>
        <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
        {STAGES.map(([v, l]) => (
          <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {demo ? (
        <p className="muted demo-note">Sample Inovix contacts for the demo. Try “Draft message”: Inovo writes a real WhatsApp message.</p>
      ) : !adding ? (
        <button className="btn" onClick={() => setAdding(true)}>Add a person</button>
      ) : (
        <form className="card form" onSubmit={add}>
          <div className="row">
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ahmed Raza" autoFocus />
            </label>
            <label>
              WhatsApp number
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0300 1234567" inputMode="tel" />
            </label>
          </div>
          <div className="row">
            <label>
              Business
              <input value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} placeholder="Al-Noor Clinic" />
            </label>
            <label>
              Role
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Owner" />
            </label>
          </div>
          <div className="row">
            <label>
              Stage
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Follow up on
              <input type="date" value={form.followup} onChange={(e) => setForm({ ...form, followup: e.target.value })} />
            </label>
          </div>
          <label>
            Notes
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Met at NIC demo day. Wants appointment reminders." />
          </label>
          <div className="row">
            <button className="btn" disabled={busy || !form.name.trim()}>Save</button>
            <button type="button" className="link" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {shown.length === 0 ? (
        <p className="muted">{filter === "due" ? "Nobody to follow up with today." : "No one here yet."}</p>
      ) : (
        <ul className="list">
          {shown.map((c) => {
            const f = followText(c.next_followup_at);
            const d = drafts[c.id];
            const waLink = `https://wa.me/${c.phone || ""}${d?.message ? `?text=${encodeURIComponent(d.message)}` : ""}`;
            return (
              <li key={c.id} className="card person">
                <div className="item-head">
                  <p className="item-title">{c.name}</p>
                  <span className={`kind ${f.cls}`}>{f.text}</span>
                </div>
                <p className="muted">
                  {[c.role, c.org].filter(Boolean).join(" · ") || "No business added"}
                  {c.phone ? ` · +${c.phone}` : " · no number"}
                  {c.source === "whatsapp" ? " · added on WhatsApp" : ""}
                </p>
                {c.notes && <p className="pre">{c.notes}</p>}

                {demo ? (
                  <p className="muted">Stage: {stageName(c.stage)}</p>
                ) : (
                <div className="row actions">
                  <select aria-label={`Stage of ${c.name}`} value={c.stage} onChange={(e) => patch(c.id, { stage: e.target.value })}>
                    {STAGES.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    aria-label={`Follow-up date for ${c.name}`}
                    value={toInput(c.next_followup_at)}
                    onChange={(e) => patch(c.id, { next_followup_at: fromInput(e.target.value) })}
                  />
                </div>
                )}

                {d && (d.loading || d.message) && (
                  <div className="draft">
                    {d.loading && !d.message ? (
                      <p className="muted">Inovo is writing…</p>
                    ) : (
                      <textarea
                        rows={4}
                        aria-label={`Message to ${c.name}`}
                        value={d.message}
                        onChange={(e) => setDrafts((x) => ({ ...x, [c.id]: { loading: false, message: e.target.value } }))}
                      />
                    )}
                  </div>
                )}

                <div className="row actions">
                  <button className="btn quiet" onClick={() => draft(c)} disabled={d?.loading}>
                    {d?.loading ? "Writing…" : d?.message ? "Write again" : "Draft message"}
                  </button>
                  <a className="btn wa" href={waLink} target="_blank" rel="noopener noreferrer">
                    {c.phone ? "Open in WhatsApp" : "Share on WhatsApp"}
                  </a>
                  {!demo && (
                    <>
                      <button className="link" onClick={() => markContacted(c)}>Mark contacted</button>
                      <button className="link danger" onClick={() => remove(c)}>Delete</button>
                    </>
                  )}
                </div>
                {c.last_contacted_at && (
                  <p className="muted small">Last contacted {new Date(c.last_contacted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
