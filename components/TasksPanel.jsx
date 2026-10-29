"use client";
// Tasks panel: your upcoming tasks and meetings (Inovo reads them before every answer),
// plus the Google (Gmail + Calendar) and WhatsApp connections.
import { useCallback, useEffect, useState } from "react";
import { api, getAccessCode } from "@/lib/api";

const dueText = (iso) => {
  if (!iso) return "No date";
  const d = new Date(iso);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const showTime = time !== "23:59";
  if (sameDay(d, today)) return `Today${showTime ? `, ${time}` : ""}`;
  if (sameDay(d, tomorrow)) return `Tomorrow${showTime ? `, ${time}` : ""}`;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + (showTime ? `, ${time}` : "");
};

const meetingWhen = (m) => {
  if (!m.start) return "";
  if (m.allDay) return new Date(`${m.start}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const d = new Date(m.start);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return same ? `Today ${time}` : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })} ${time}`;
};

export default function TasksPanel({ dbReady }) {
  const [tasks, setTasks] = useState([]);
  const [gmail, setGmail] = useState(null);
  const [cal, setCal] = useState(null); // { granted, meetings, error }
  const [wa, setWa] = useState(null); // WhatsApp bot status
  const [demo, setDemo] = useState(false); // public link: sample data, read-only
  const [form, setForm] = useState({ title: "", due: "", notes: "" });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, g, m, w] = await Promise.all([
        api("/api/tasks"),
        api("/api/google"),
        api("/api/meetings").catch((e) => ({ error: e.message, meetings: [] })),
        api("/api/whatsapp/status").catch(() => null),
      ]);
      setTasks(t.tasks || []);
      setDemo(Boolean(t.demo));
      setGmail(g);
      setCal(m);
      setWa(w);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    load();
    // the app checks Gmail in the background; refresh when new tasks arrive
    const onNew = () => load();
    window.addEventListener("inoverse:tasks-updated", onNew);
    return () => window.removeEventListener("inoverse:tasks-updated", onNew);
  }, [dbReady, load]);

  if (!dbReady) {
    return (
      <div className="empty">
        <p>Connect Supabase to keep your tasks.</p>
        <p className="muted">Follow “Connect Supabase” in the README, then reload this page.</p>
      </div>
    );
  }

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        body: { title: form.title, notes: form.notes, due_at: form.due ? new Date(form.due).toISOString() : null },
      });
      setForm({ title: "", due: "", notes: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setDone(t) {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status: "done" } });
      setTasks((x) => x.filter((i) => i.id !== t.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(t) {
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      setTasks((x) => x.filter((i) => i.id !== t.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function checkNow() {
    setBusy(true);
    setNote("");
    try {
      const r = await api("/api/tasks/sync", { method: "POST" });
      if (r.error) setError(r.error);
      else setNote(r.added ? `Added ${r.added} task${r.added === 1 ? "" : "s"} from your email.` : "No new Inovo emails.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendBrief() {
    setBusy(true);
    setNote("");
    try {
      const r = await api("/api/whatsapp/brief", { method: "POST" });
      setNote(r.sent ? "Sent today's brief to your WhatsApp." : r.reason);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    try {
      await api("/api/google", { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const code = getAccessCode();
  const connectHref = `/api/google/connect${code ? `?access=${encodeURIComponent(code)}` : ""}`;
  const now = Date.now();

  return (
    <div className="stack">
      <p className="lead">Inovo reads these before every answer, so it knows what's coming up for you.</p>

      {cal?.granted && (
        <div className="card">
          <p className="item-title">Meetings this week</p>
          {cal.error ? (
            <p className="error">{cal.error}</p>
          ) : cal.meetings.length === 0 ? (
            <p className="muted">No meetings in the next 7 days.</p>
          ) : (
            <ul className="meetings">
              {cal.meetings.map((m, i) => (
                <li key={i}>
                  <span className="kind">{meetingWhen(m)}</span>
                  <span>
                    {m.title}
                    {m.people.length > 0 && <span className="muted"> · with {m.people.slice(0, 3).join(", ")}</span>}
                  </span>
                  {m.link && <a className="link" href={m.link} target="_blank" rel="noopener noreferrer">Join</a>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {demo && (
        <div className="card demo-note">
          <p className="item-title">Demo data</p>
          <p className="muted">
            This public link shows sample Inovix tasks, meetings and people, so nothing private is shared. On the founder's
            laptop the same panels show real Gmail, Calendar and contacts. Try asking Inovo “What's on my plate today?” or
            “Tell me about my latest email”.
          </p>
        </div>
      )}

      {!demo && (
      <div className="card">
        <p className="item-title">Google: Gmail + Calendar</p>
        {!gmail ? (
          <p className="muted">Checking…</p>
        ) : !gmail.configured ? (
          <p className="muted">
            Gmail isn't set up yet. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to{" "}
            <code>.env.local</code> (see “Connect Gmail” in the README), then restart the app.
          </p>
        ) : !gmail.connected ? (
          <>
            <p className="muted">
              Inovo will read only emails whose subject starts with <b>Inovo</b>. Nothing else in your inbox is touched.
            </p>
            <a className="btn" href={connectHref}>Connect Gmail</a>
          </>
        ) : (
          <>
            <p className="muted">
              Connected as <b>{gmail.account || "your Google account"}</b>. Checked every 5 minutes while Inoverse is open
              {gmail.last_synced_at ? `, last at ${new Date(gmail.last_synced_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}.
            </p>
            <p className="muted">
              Email yourself with a subject like <b>Inovo: pitch at NIC on Friday 3pm</b>.
            </p>
            {!gmail.calendar && (
              <p className="warn">
                Calendar isn't connected yet. <a href={connectHref}>Connect Google again</a> and allow calendar access so
                Inovo sees your meetings.
              </p>
            )}
            <div className="row">
              <button className="btn" onClick={checkNow} disabled={busy}>{busy ? "Checking…" : "Check email now"}</button>
              <button className="link danger" onClick={disconnect}>Disconnect</button>
            </div>
          </>
        )}
      </div>

      )}

      {!demo && (
      <div className="card">
        <p className="item-title">WhatsApp</p>
        {!wa ? (
          <p className="muted">Checking…</p>
        ) : !wa.configured ? (
          <p className="muted">
            Text Inovo from your phone and get a morning brief. Set it up with “Connect WhatsApp” in the README (needs the
            Vercel link).
          </p>
        ) : (
          <>
            <p className="muted">
              Inovo answers WhatsApp messages from <b>{wa.owner || "your number"}</b>. Text it things like “Meeting with
              Ahmed from Al-Noor clinic Monday 4pm” and it saves them. Send “brief” for today's plan.
            </p>
            <button className="btn" onClick={sendBrief} disabled={busy}>Send me today's brief</button>
          </>
        )}
      </div>
      )}
      {note && <p className="muted">{note}</p>}

      {!demo && (
      <form className="card form" onSubmit={add}>
        <label>
          Task
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Send proposal to the clinic" />
        </label>
        <div className="row">
          <label>
            Due
            <input type="datetime-local" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </label>
        </div>
        <label>
          Notes
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
        </label>
        <button className="btn" disabled={busy || !form.title.trim()}>Add task</button>
      </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {tasks.length === 0 ? (
        <p className="muted">No upcoming tasks.</p>
      ) : (
        <ul className="list">
          {tasks.map((t) => (
            <li key={t.id} className="card">
              <div className="item-head">
                <span className={`kind ${t.due_at && Date.parse(t.due_at) < now ? "k-overdue" : ""}`}>{dueText(t.due_at)}</span>
                {t.source === "email" && <span className="muted">from email</span>}
              </div>
              <p className="item-title">{t.title}</p>
              {t.notes && <p className="pre">{t.notes}</p>}
              {!demo && (
                <div className="row">
                  <button className="link" onClick={() => setDone(t)}>Mark done</button>
                  <button className="link danger" onClick={() => remove(t)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
