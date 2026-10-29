// "Tell me about my latest email": Inovo reads the newest inbox emails and summarises them.
// Real Gmail only on the laptop; the public demo uses Inovix sample emails.
import { gemma } from "@/lib/gemma";
import { latestEmails, TIMEZONE } from "@/lib/google";
import { isDemo, demoEmails } from "@/lib/demo";

// Asking about email: "latest email", "any new mail?", "check my inbox", "meri emails parho"…
export function detectEmailIntent(text) {
  const t = text.toLowerCase();
  if (!/\b(e-?mails?|mails?|inbox|gmail)\b/.test(t)) return false;
  return /\b(latest|last|new|newest|recent|received|got|get|check|read|any|today|unread|inbox|show|tell|summar\w*|parh\w*|dekh\w*|aayi|ayi|aaya|kya|say|said|says|wrote|reply|replied)\b/.test(t);
}

const when = (iso) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function emailBrief({ lang = "en" } = {}) {
  const demo = isDemo();
  let emails;
  try {
    emails = demo ? demoEmails() : await latestEmails(5);
  } catch (err) {
    const say = lang === "ur" ? "Boss, abhi main aap ki emails nahi parh sakta. Pehle Tasks panel mein Gmail connect karein." : `I can't read your email yet, boss. ${err.message}`;
    return { skill: "email", say, details: err.message };
  }
  if (!emails.length) {
    return { skill: "email", say: lang === "ur" ? "Inbox khali hai, boss." : "Your inbox is empty, boss. Nothing new.", details: "No emails in your Primary inbox." };
  }

  const list = emails
    .map((e, i) => `EMAIL ${i + 1}\nFrom: ${e.from}\nDate: ${when(e.date)}\nSubject: ${e.subject}\n${e.body}`)
    .join("\n\n---\n\n");
  let out;
  try {
    out = await gemma(
      `${list}

These are the founder's ${emails.length} newest emails, newest first. Reply with ONLY JSON:
{"say": "2-4 spoken sentences: how many emails, the most important one first, and which ones need a reply. Plain words, no lists or symbols.${lang === "ur" ? " Simple Roman Urdu." : ""}",
 "details": "markdown: one bullet per email: **sender name**, subject, time, a one-line summary, and 'Needs a reply' if it does. Then one line: what to answer first."}`,
      { system: "You are Inovo, the founder's AI cofounder. Summarise emails accurately. Never invent emails, senders or facts.", temperature: 0.3, json: true, fast: true }
    );
  } catch {
    // summary failed: still show the emails plainly
    out = {
      say: `You have ${emails.length} recent emails. The newest is from ${emails[0].from.replace(/<.*>/, "").trim()}: ${emails[0].subject}.`,
      details: emails.map((e) => `- **${e.from.replace(/<.*>/, "").trim()}**: ${e.subject} (${when(e.date)})`).join("\n"),
    };
  }
  const note = demo ? "\n\n_Sample emails: the public demo never reads a real inbox._" : "";
  return { skill: "email", say: out.say || "", details: (out.details || out.say || "") + note };
}
