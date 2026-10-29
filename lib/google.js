// Google sign-in (OAuth) and Gmail reading for Inoverse. Server only.
// Inovo reads ONLY emails whose subject starts with "Inovo" and turns them into tasks.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (see README).
import { gemma } from "@/lib/gemma";
import { addTask, getIntegration, knownSourceIds, markSynced } from "@/lib/tasks";

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];
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
  return { refresh_token: t.refresh_token, account };
}

export async function revoke(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

async function gmail(accessToken, pathAndQuery) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
  const offset = tzOffset();
  return (Array.isArray(out?.tasks) ? out.tasks : [])
    .filter((t) => t && typeof t.title === "string" && t.title.trim())
    .map((t) => {
      let due = null;
      if (typeof t.due === "string" && /^\d{4}-\d{2}-\d{2}/.test(t.due)) {
        // a date with no time counts as end of that day
        due = t.due.length > 10 ? `${t.due.slice(0, 16)}:00${offset}` : `${t.due}T23:59:00${offset}`;
      }
      return { title: t.title, notes: typeof t.notes === "string" ? t.notes : "", due_at: due };
    });
}

// Check Gmail for new "Inovo" emails and save their tasks. Returns { added, checked }.
export async function syncGmail() {
  const integ = await getIntegration(PROVIDER);
  if (!integ) return { connected: false, added: 0, checked: 0 };

  let access;
  try {
    access = (await tokenRequest({ refresh_token: integ.refresh_token, grant_type: "refresh_token" })).access_token;
  } catch (err) {
    if (err.code === "invalid_grant") {
      const e = new Error("Your Google sign-in has expired. Open the Tasks tab and connect Gmail again.");
      e.expired = true;
      throw e;
    }
    throw err;
  }

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
