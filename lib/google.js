// Google sign-in (OAuth), Gmail and Google Calendar for INOVERSE. Server only.
// Gmail: Inovo reads ONLY emails whose subject starts with "Inovo" and turns them into tasks.
// Calendar: Inovo reads your upcoming meetings (read-only) so it can plan around them.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (see README).
import { gemma } from "@/lib/gemma";
import { addTask, getIntegration, knownSourceIds, markSynced } from "@/lib/tasks";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", CALENDAR_SCOPE];
export const PROVIDER = "google";
export const TIMEZONE = process.env.TIMEZONE || "Asia/Karachi";
const SUBJECT_TAG = /^\s*(?:(?:re|fwd?):\s*)*inovo\b[\s:,\-–—]*/i;

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Where Google sends you back after sign-in. Must match the redirect URI in Google Cloud.
export const redirectUri = (origin) => `${(process.env.APP_URL || origin).replace(/\/$/, "")}/api/google/callback`;

export function authUrl(origin, state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // gives a refresh token so Inovo can keep checking
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `Google sign-in failed (${res.status})`);
    err.code = data.error;
    throw err;
  }
  return data;
}

export async function exchangeCode(code, origin) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  // the email address comes inside the id_token (a JWT); we only need its payload
  let account = "";
  try {
    account = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email || "";
  } catch {}
  return { refresh_token: t.refresh_token, account, scopes: t.scope || "" };
}

// Did the founder allow calendar access when they connected? (Older connections were Gmail only.)
export const calendarGranted = (integ) => Boolean(integ?.scopes?.includes(CALENDAR_SCOPE));

// A short-lived access token from the saved sign-in, reused for ~50 minutes.
let tokenCache = { token: "", until: 0, refresh: "" };
async function accessToken(integ) {
  if (tokenCache.token && tokenCache.until > Date.now() && tokenCache.refresh === integ.refresh_token) {
    return tokenCache.token;
  }
  try {
    const t = await tokenRequest({ refresh_token: integ.refresh_token, grant_type: "refresh_token" });
    tokenCache = { token: t.access_token, until: Date.now() + Math.min(3000, (t.expires_in || 3600) - 300) * 1000, refresh: integ.refresh_token };
    return t.access_token;
  } catch (err) {
    if (err.code === "invalid_grant") {
      const e = new Error("Your Google sign-in has expired. Open the Tasks panel and connect Google again.");
      e.expired = true;
      throw e;
    }
    throw err;
  }
}

// ---------- Google Calendar ----------
let meetingsCache = { at: 0, data: null };

// Upcoming meetings in the next `days` days, soonest first. Cached for 5 minutes,
// because Inovo reads them before every answer.
// Returns { connected, granted, meetings: [{ title, start, end, allDay, location, people, link }] }
export async function upcomingMeetings({ days = 7, fresh = false } = {}) {
  if (!googleConfigured()) return { connected: false, granted: false, meetings: [] };
  const integ = await getIntegration(PROVIDER).catch(() => null);
  if (!integ) return { connected: false, granted: false, meetings: [] };
  if (!calendarGranted(integ)) return { connected: true, granted: false, meetings: [] };
  if (!fresh && meetingsCache.data && Date.now() - meetingsCache.at < 5 * 60 * 1000) return meetingsCache.data;

  const token = await accessToken(integ);
  const now = new Date();
  const q = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + days * 864e5).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const info = await res.text();
    if (res.status === 403 && /has not been used|disabled/i.test(info)) {
      throw new Error("Turn on the Google Calendar API in Google Cloud (APIs & Services → Library), then try again.");
    }
    if (res.status === 403) return { connected: true, granted: false, meetings: [] };
    throw new Error(`Google Calendar ${res.status}: ${info.slice(0, 200)}`);
  }
  const data = await res.json();
  const meetings = (data.items || [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      title: e.summary || "(no title)",
      start: e.start?.dateTime || e.start?.date || null,
      end: e.end?.dateTime || e.end?.date || null,
      allDay: Boolean(e.start?.date && !e.start?.dateTime),
      location: e.location || "",
      people: (e.attendees || []).filter((a) => !a.self).map((a) => a.displayName || a.email).slice(0, 8),
      link: e.hangoutLink || "",
    }));
  meetingsCache = { at: Date.now(), data: { connected: true, granted: true, meetings } };
  return meetingsCache.data;
}

// "Fri 31 Oct, 15:00" in the founder's timezone ("Fri 31 Oct, all day" for all-day events)
export function meetingTime(m) {
  if (!m.start) return "time unknown";
  if (m.allDay) {
    return new Date(`${m.start}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + ", all day";
  }
  return new Date(m.start).toLocaleString("en-GB", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export async function revoke(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

async function gmail(accessToken, pathAndQuery) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const info = await res.text();
    if (res.status === 403 && /has not been used|disabled/i.test(info)) {
      throw new Error("Turn on the Gmail API in Google Cloud (APIs & Services → Library → Gmail API → Enable), wait a few minutes, then try again.");
    }
    throw new Error(`Gmail ${res.status}: ${info.slice(0, 200)}`);
  }
  return res.json();
}

// Plain text of an email: the text/plain part if there is one, else HTML with tags removed.
function bodyText(payload) {
  const parts = [];
  const walk = (p) => {
    if (!p) return;
    if (p.body?.data && /^text\/(plain|html)/.test(p.mimeType || "")) parts.push(p);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  const pick = parts.find((p) => p.mimeType.startsWith("text/plain")) || parts[0];
  if (!pick) return "";
  let t = Buffer.from(pick.body.data, "base64url").toString("utf8");
  if (pick.mimeType.startsWith("text/html")) t = t.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  // drop quoted replies ("On … wrote:") so old text isn't read again
  t = t.split(/\nOn .+wrote:\s*\n/)[0];
  return t.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
}

const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || "";

// Your newest emails from the Primary inbox (no promotions, social or updates),
// only when you ask Inovo about them. Returns [{ from, subject, date, body }].
export async function latestEmails(n = 5) {
  if (!googleConfigured()) throw new Error("Gmail isn't set up yet. Add the Google keys to .env.local.");
  const integ = await getIntegration(PROVIDER);
  if (!integ) throw new Error("Gmail isn't connected yet. Open the Tasks panel and click Connect Gmail.");
  const access = await accessToken(integ);
  const list = await gmail(access, `messages?${new URLSearchParams({ q: "in:inbox category:primary", maxResults: String(n) })}`);
  const out = [];
  for (const { id } of list.messages || []) {
    const msg = await gmail(access, `messages/${id}?format=full`);
    out.push({
      from: header(msg, "from"),
      subject: header(msg, "subject") || "(no subject)",
      date: new Date(Number(msg.internalDate) || Date.now()).toISOString(),
      body: bodyText(msg.payload).slice(0, 1500) || msg.snippet || "",
    });
  }
  return out;
}

// Today's date and time where the founder is, e.g. "Thursday, 29 October 2026, 14:05".
export function nowText() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

// Offset of TIMEZONE from UTC right now, like "+05:00".
function tzOffset() {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "longOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] || "00"}` : "+05:00";
}

// Gemma reads one marked email and returns the task(s) in it.
async function extractTasks({ subject, body, sentAt }) {
  const out = await gemma(
    `Today is ${nowText()} (${TIMEZONE}). The founder emailed themselves this note for their AI cofounder.
Pull out every task, meeting or deadline in it. Work out real dates from words like "tomorrow" or "Friday", counting from the day the email was sent (${sentAt}).

SUBJECT: ${subject}
EMAIL: ${body || "(no body)"}

Reply with ONLY JSON:
{"tasks": [{"title": "short task, max 12 words", "due": "YYYY-MM-DDTHH:mm in local time, or YYYY-MM-DD if no time, or null", "notes": "useful details from the email, or empty"}]}`,
    { temperature: 0, json: true, fast: true }
  );
  return (Array.isArray(out?.tasks) ? out.tasks : [])
    .filter((t) => t && typeof t.title === "string" && t.title.trim())
    .map((t) => ({ title: t.title, notes: typeof t.notes === "string" ? t.notes : "", due_at: dueFromLocal(t.due) }));
}

// "2026-10-31T15:00" or "2026-10-31" in the founder's local time → a full timestamp.
// A date with no time counts as the end of that day. Anything else → null.
export function dueFromLocal(due) {
  if (typeof due !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(due)) return null;
  const offset = tzOffset();
  return due.length > 10 ? `${due.slice(0, 16)}:00${offset}` : `${due.slice(0, 10)}T23:59:00${offset}`;
}

// Check Gmail for new "Inovo" emails and save their tasks. Returns { added, checked }.
export async function syncGmail() {
  const integ = await getIntegration(PROVIDER);
  if (!integ) return { connected: false, added: 0, checked: 0 };

  const access = await accessToken(integ);
  const list = await gmail(access, `messages?${new URLSearchParams({ q: "subject:inovo newer_than:30d -in:trash -in:spam", maxResults: "25" })}`);
  const ids = (list.messages || []).map((m) => m.id);
  const known = await knownSourceIds(ids);
  let added = 0;
  let checked = 0;

  for (const id of ids.filter((i) => !known.has(i)).reverse()) {
    const msg = await gmail(access, `messages/${id}?format=full`);
    const subjectRaw = header(msg, "subject");
    if (!SUBJECT_TAG.test(subjectRaw)) continue; // "Inovo" must start the subject
    checked++;
    const subject = subjectRaw.replace(SUBJECT_TAG, "").trim();
    const sentAt = new Date(Number(msg.internalDate) || Date.now()).toLocaleString("en-GB", { timeZone: TIMEZONE });
    const tasks = await extractTasks({ subject, body: bodyText(msg.payload), sentAt });
    if (!tasks.length) tasks.push({ title: subject || "Task from email", notes: "", due_at: null });
    // the first task carries the email id so the email isn't read again
    for (const [i, t] of tasks.entries()) {
      await addTask({ ...t, source: "email", source_id: i === 0 ? id : `${id}#${i}` });
      added++;
    }
  }
  await markSynced(PROVIDER);
  return { connected: true, added, checked };
}
