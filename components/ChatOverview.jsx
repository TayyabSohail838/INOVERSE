"use client";
// The Chat overview: everything in one place. Your conversation with Inovo, upcoming
// work, the latest weekly review, a company report, and the issues the skills found.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const DAY = 864e5;
const daysAgo = (d) => Math.max(0, Math.floor((Date.now() - Date.parse(d)) / DAY));
const shortDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const dueText = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(", 23:59", "")
    : "No date";
const clip = (s, n) => (s && s.length > n ? s.slice(0, n).trimEnd() + "…" : s || "");

const SECTIONS = [
  ["conversation", "Conversation"],
  ["work", "Upcoming work"],
  ["weekly", "Weekly review"],
  ["company", "Company report"],
  ["issues", "Issues found"],
];

const SKILL_NAMES = {
  "solo-founder": "Founder mode",
  roast: "Gap check",
  "client-scope": "Client scope",
  "weekly-review": "Weekly review",
  "pricing-strategist": "Pricing",
  "open-website": "Open website",
};

// inline: shown inside the Chat panel instead of as a pop-up
export default function ChatOverview({ open, onClose, log, dbReady, inline = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    // each part loads on its own, so one failure doesn't blank the rest
    const get = (p) => api(p).catch((e) => ({ error: e.message }));
    const [tasks, commitments, weekly, company, experiments, evidence] = await Promise.all([
      get("/api/tasks"),
      get("/api/commitments"),
      get("/api/weekly-review"),
      get("/api/company"),
      get("/api/experiments"),
      get("/api/evidence"),
    ]);
    setData({ tasks, commitments, weekly, company, experiments, evidence });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (dbReady) load();
    if (inline) return;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dbReady, load, onClose, inline]);

  if (!open) return null;

  const jump = (id) => bodyRef.current?.querySelector(`#ov-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const tasks = data?.tasks?.tasks || [];
  const commitments = data?.commitments?.commitments || [];
  const review = data?.weekly?.reviews?.[0];
  const company = data?.company || {};
  const experiments = data?.experiments?.experiments || [];
  const gapChecks = data?.experiments?.gapChecks || [];
  const evidenceCount = (data?.evidence?.evidence || []).length;

  // ---------- issues the skills and the app's checks have found ----------
  const issues = [];
  for (const t of tasks) {
    if (t.due_at && Date.parse(t.due_at) < Date.now()) issues.push({ level: "high", from: "Tasks", text: `Overdue: ${t.title} (was due ${dueText(t.due_at)})` });
  }
  for (const c of commitments) {
    const d = daysAgo(c.last_touched_at);
    if (d > 14) issues.push({ level: "med", from: "Weekly review", text: `Stalled ${d} days: ${c.name}` });
    if (!c.next_action) issues.push({ level: "med", from: "Weekly review", text: `No next action: ${c.name}` });
    if (!c.owner) issues.push({ level: "low", from: "Weekly review", text: `No owner: ${c.name}` });
  }
  for (const f of review?.output?.health?.flags || review?.health?.rows?.flatMap((r) => r.flags.map((flag) => ({ item: r.name, flag }))) || []) {
    const text = `${f.flag}: ${f.item}`;
    if (!issues.some((i) => i.text.includes(f.item))) issues.push({ level: "med", from: "Weekly review", text });
  }
  for (const g of gapChecks.slice(0, 8)) {
    const v = g.verdict?.verdict;
    if (v === "KILL" || v === "RESHAPE") issues.push({ level: v === "KILL" ? "high" : "med", from: "Gap check", text: `${v}: ${clip(g.idea, 90)}` });
  }
  for (const e of experiments) {
    if (e.status === "failed") issues.push({ level: "med", from: "48-hour test", text: `Failed: ${clip(e.name, 90)}` });
    if (e.status === "planned" && daysAgo(e.created_at) > 7) issues.push({ level: "low", from: "48-hour test", text: `Not started after ${daysAgo(e.created_at)} days: ${clip(e.name, 80)}` });
  }
  if (dbReady && data && evidenceCount === 0) issues.push({ level: "low", from: "Gap check", text: "No evidence logged yet, so gap checks have little to go on." });
  const order = { high: 0, med: 1, low: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);

  const convo = log.filter((m) => m.text).slice(-30);

  const refresh = dbReady && (
    <button className="link" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
  );

  const content = (
    <>
        <nav className="ov-nav" aria-label="Overview sections">
          {SECTIONS.map(([id, label]) => (
            <button key={id} onClick={() => jump(id)}>
              {label}
              {id === "issues" && issues.length > 0 && <span className="ov-count">{issues.length}</span>}
              {id === "work" && tasks.length > 0 && <span className="ov-count quiet">{tasks.length}</span>}
            </button>
          ))}
        </nav>

        <div className="ov-body" ref={bodyRef}>
          {!dbReady && <p className="muted">Connect Supabase to see tasks, reviews and reports here. Your conversation is below.</p>}

          {/* ---------- Conversation ---------- */}
          <section id="ov-conversation" className="ov-sec">
            <h3>Conversation</h3>
            {convo.length === 0 ? (
              <p className="muted">Nothing yet. Click Talk or type to Inovo.</p>
            ) : (
              <ol className="ov-convo">
                {convo.map((m, i) => (
                  <li key={i} className={m.role}>
                    <span className="ov-who">{m.role === "user" ? "You" : `Inovo${m.skill ? ` · ${SKILL_NAMES[m.skill] || m.skill}` : ""}`}</span>
                    <p>{clip(m.text.replace(/[#*_`]/g, "").replace(/\s+/g, " "), m.role === "user" ? 400 : 260)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ---------- Upcoming work ---------- */}
          <section id="ov-work" className="ov-sec">
            <h3>Upcoming work</h3>
            <h4>Your tasks</h4>
            {data?.tasks?.error ? (
              <p className="error">{data.tasks.error}</p>
            ) : tasks.length === 0 ? (
              <p className="muted">No upcoming tasks. Add some in the Tasks tab or email yourself “Inovo: …”.</p>
            ) : (
              <ul className="ov-list">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <span className={`ov-tag ${t.due_at && Date.parse(t.due_at) < Date.now() ? "bad" : ""}`}>{dueText(t.due_at)}</span>
                    {t.title}
                    {t.source === "email" && <span className="muted"> · from email</span>}
                  </li>
                ))}
              </ul>
            )}
            <h4>Team commitments</h4>
            {commitments.length === 0 ? (
              <p className="muted">No commitments tracked. Add them in the Weekly review tab.</p>
            ) : (
              <ul className="ov-list">
                {commitments.map((c) => (
                  <li key={c.id}>
                    <b>{c.name}</b> <span className="muted">· {c.owner || "no owner"} · {c.status}</span>
                    <br />
                    <span className={c.next_action ? "" : "warn"}>{c.next_action ? `Next: ${c.next_action}` : "No next action"}</span>
                  </li>
                ))}
              </ul>
            )}
            {experiments.filter((e) => e.status === "planned" || e.status === "running").length > 0 && (
              <>
                <h4>48-hour tests to run</h4>
                <ul className="ov-list">
                  {experiments
                    .filter((e) => e.status === "planned" || e.status === "running")
                    .map((e) => (
                      <li key={e.id}>
                        <span className="ov-tag">{e.status}</span>
                        {clip(e.name, 120)}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>

          {/* ---------- Weekly review ---------- */}
          <section id="ov-weekly" className="ov-sec">
            <h3>Weekly review</h3>
            {!review ? (
              <p className="muted">No weekly review yet. Run one from the Weekly review tab.</p>
            ) : (
              <div className="ov-review">
                <p className="muted">From {shortDate(review.created_at)}</p>
                {(review.output?.health || review.health) && (
                  <p>
                    Health: <b>{(review.output?.health || review.health).score}/100</b> · {(review.output?.health || review.health).verdict}
                  </p>
                )}
                {review.output?.one_goal_this_week && (
                  <p>
                    <b>Goal this week:</b> {review.output.one_goal_this_week}
                  </p>
                )}
                {review.output?.done_last_week?.filter(Boolean).length > 0 && (
                  <>
                    <h4>Done</h4>
                    <ul className="ov-list">{review.output.done_last_week.filter(Boolean).map((d, i) => <li key={i}>{d}</li>)}</ul>
                  </>
                )}
                {review.output?.stalled?.filter((s) => s.item).length > 0 && (
                  <>
                    <h4>Stalled</h4>
                    <ul className="ov-list">
                      {review.output.stalled.filter((s) => s.item).map((s, i) => (
                        <li key={i}>
                          <b>{s.item}</b> — {s.why} <span className="ov-tag">{s.suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {review.output?.deadlines_next_14_days?.filter((d) => d.item).length > 0 && (
                  <>
                    <h4>Deadlines (next 14 days)</h4>
                    <ul className="ov-list">
                      {review.output.deadlines_next_14_days.filter((d) => d.item).map((d, i) => (
                        <li key={i}><span className="ov-tag">{d.date}</span>{d.item}</li>
                      ))}
                    </ul>
                  </>
                )}
                {review.output?.tasks?.filter((t) => t.task).length > 0 && (
                  <>
                    <h4>Who does what</h4>
                    <ul className="ov-list">
                      {review.output.tasks.filter((t) => t.task).map((t, i) => (
                        <li key={i}><b>{t.owner}</b>: {t.task} <span className="muted">· {t.day}</span></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ---------- Company report ---------- */}
          <section id="ov-company" className="ov-sec">
            <h3>Company report</h3>
            {company.error ? (
              <p className="error">{company.error}</p>
            ) : (
              <>
                <p>
                  <b>{company.profile?.name || "Inovix"}</b>
                  {company.profile?.about ? ` — ${clip(company.profile.about, 400)}` : ""}
                </p>
                <div className="ov-stats">
                  <div><b>{(company.team || []).length}</b><span>people</span></div>
                  <div><b>{(company.products || []).length}</b><span>products</span></div>
                  <div><b>{tasks.length}</b><span>open tasks</span></div>
                  <div><b>{evidenceCount}</b><span>evidence notes</span></div>
                  <div><b>{gapChecks.length}</b><span>gap checks</span></div>
                  <div><b>{experiments.filter((e) => e.status === "passed").length}/{experiments.length}</b><span>tests passed</span></div>
                </div>
                {(company.team || []).length > 0 && (
                  <>
                    <h4>Team</h4>
                    <ul className="ov-list">{company.team.map((t) => <li key={t.id}><b>{t.name}</b> <span className="muted">· {t.role || "role not set"}</span></li>)}</ul>
                  </>
                )}
                {(company.products || []).length > 0 && (
                  <>
                    <h4>Products</h4>
                    <ul className="ov-list">
                      {company.products.map((p) => (
                        <li key={p.id}><span className="ov-tag">{p.stage}</span><b>{p.name}</b>{p.description ? ` — ${clip(p.description, 140)}` : ""}</li>
                      ))}
                    </ul>
                  </>
                )}
                {gapChecks.length > 0 && (
                  <>
                    <h4>Recent gap checks</h4>
                    <ul className="ov-list">
                      {gapChecks.slice(0, 6).map((g) => (
                        <li key={g.id}>
                          <span className={`ov-tag v-${(g.verdict?.verdict || "").toLowerCase()}`}>{g.verdict?.verdict || "—"}</span>
                          {clip(g.idea, 110)} <span className="muted">· {shortDate(g.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          {/* ---------- Issues ---------- */}
          <section id="ov-issues" className="ov-sec">
            <h3>Issues found</h3>
            {!data && dbReady ? (
              <p className="muted">Loading…</p>
            ) : issues.length === 0 ? (
              <p className="muted">Nothing flagged right now.</p>
            ) : (
              <ul className="ov-issues">
                {issues.map((i, n) => (
                  <li key={n} className={`lvl-${i.level}`}>
                    <span className="ov-from">{i.from}</span>
                    {i.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="ov ov-inline">
        <div className="ov-inline-bar">{refresh}</div>
        {content}
      </div>
    );
  }

  return (
    <div className="ov-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <section className="ov" role="dialog" aria-modal="true" aria-labelledby="ov-title">
        <header className="ov-head">
          <h2 id="ov-title">Inoverse overview</h2>
          <div className="ov-actions">
            {refresh}
            <button className="ov-close" onClick={onClose} ref={closeRef} aria-label="Close overview">✕</button>
          </div>
        </header>
        {content}
      </section>
    </div>
  );
}
