// Demo mode: the public Vercel link shows realistic sample data instead of the
// founder's real tasks, meetings, contacts and emails. Real data only on the laptop.
//
// On by default on Vercel (process.env.VERCEL), off on localhost.
// Override with DEMO_MODE=on or DEMO_MODE=off.
// Decided on the server from where it runs, so a visitor can't switch it.

export function isDemo() {
  const v = (process.env.DEMO_MODE || "").toLowerCase();
  if (v === "on" || v === "true" || v === "1") return true;
  if (v === "off" || v === "false" || v === "0") return false;
  return Boolean(process.env.VERCEL);
}

export class DemoError extends Error {}

// Writes on the public demo are refused with a friendly message.
export function demoReadOnly() {
  if (isDemo()) throw new DemoError("This is the public demo, so changes aren't saved. Run INOVERSE on your own laptop to use your real data.");
}

// ---------- dates relative to now, in Pakistan time (UTC+5) ----------
const PKT = 5 * 3600 * 1000;
function at(dayOffset, hour, minute = 0) {
  const nowPk = new Date(Date.now() + PKT);
  const d = Date.UTC(nowPk.getUTCFullYear(), nowPk.getUTCMonth(), nowPk.getUTCDate() + dayOffset, hour, minute) - PKT;
  return new Date(d).toISOString();
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Everything below is about Inovix & Co, matching the pitch deck: Wattly and Fabriq AI
// (prototypes), Mental Health Companion (live MVP), Kidz Lab and the AI Clinic Assistant
// (client builds, delivered). Team: M Tayyab Sohail, Shiza Fatima, Hasnain Ahmad.
// The customers and emails are made up for the demo.
export function demoTasks() {
  return [
    { id: id(101), title: "Send Faisal Textiles the Fabriq AI pilot quote", notes: "They want setup included and a one-day install", due_at: at(-1, 17), status: "open", source: "email" },
    { id: id(102), title: "Fix double reminders in the AI Clinic Assistant", notes: "Shiza is on it; ship before today's clinic call", due_at: at(0, 15), status: "open", source: "manual" },
    { id: id(103), title: "Propose a paid monthly plan to Al-Noor Clinic", notes: "AI Clinic Assistant is delivered; next step is an app plan", due_at: at(1, 17), status: "open", source: "manual" },
    { id: id(104), title: "Final Inovix pitch deck to NIC by Thursday night", notes: "Fill in the Wattly pricing on the business model slide", due_at: at(3, 23, 59), status: "open", source: "email" },
    { id: id(105), title: "Quote a Kidz Lab one-month trial for City School", notes: "20 students, grade 6", due_at: at(2, 23, 59), status: "open", source: "email" },
    { id: id(106), title: "Check Wattly's bill prediction against a real K-Electric bill", notes: "Hasnain to update the slab alert design", due_at: at(5, 23, 59), status: "open", source: "manual" },
  ].map((t) => ({ ...t, created_at: at(-3, 9) }));
}

export function demoMeetings() {
  return {
    connected: true,
    granted: true,
    demo: true,
    meetings: [
      { title: "Inovix stand-up", start: at(0, 10), end: at(0, 10, 15), allDay: false, location: "", people: ["Shiza Fatima", "Hasnain Ahmad"], link: "" },
      { title: "AI Clinic Assistant review with Al-Noor Clinic", start: at(0, 16), end: at(0, 16, 45), allDay: false, location: "Google Meet", people: ["Dr. Sana Malik"], link: "" },
      { title: "NIC Faisalabad mentor session", start: at(2, 11), end: at(2, 12), allDay: false, location: "NIC Faisalabad", people: ["Hira Khan"], link: "" },
      { title: "Fabriq AI site visit: Faisal Textiles", start: at(4, 14, 30), end: at(4, 16), allDay: false, location: "Sargodha Road, Faisalabad", people: ["Faisal Ahmed", "Shiza Fatima"], link: "" },
      { title: "Mental Health Companion user feedback review", start: at(6, 12), end: at(6, 12, 30), allDay: false, location: "", people: ["Hasnain Ahmad"], link: "" },
    ],
  };
}

export function demoContacts() {
  // no phone numbers on purpose: made-up numbers could belong to real people
  return [
    { id: id(201), name: "Faisal Ahmed", phone: "", org: "Faisal Textiles", role: "Mill owner", stage: "proposal", next_followup_at: at(-2, 23, 59), last_contacted_at: at(-6, 12), notes: "Fabriq AI lead. 40 looms. Liked the live defect demo (holes, stains, weft bars). Worried about setup time. Waiting on a revised quote.", source: "manual" },
    { id: id(202), name: "Usman Tariq", phone: "", org: "City School, Faisalabad", role: "Principal", stage: "lead", next_followup_at: at(0, 23, 59), last_contacted_at: null, notes: "Wants a Kidz Lab client build for an after-school Python + AI club.", source: "whatsapp" },
    { id: id(203), name: "Dr. Sana Malik", phone: "", org: "Al-Noor Clinic", role: "Owner", stage: "client", next_followup_at: at(1, 23, 59), last_contacted_at: at(-1, 15), notes: "AI Clinic Assistant delivered. 80 patients a day. Open to a paid monthly plan if reminders work in Urdu.", source: "manual" },
    { id: id(204), name: "Hira Khan", phone: "", org: "NIC Faisalabad", role: "Program manager", stage: "contacted", next_followup_at: at(4, 23, 59), last_contacted_at: at(-3, 11), notes: "Demo Day this Saturday. Can introduce Inovix to 2 clinic chains.", source: "manual" },
    { id: id(205), name: "Bilal Raza", phone: "", org: "Raza Electronics", role: "Shop owner", stage: "lead", next_followup_at: at(6, 23, 59), last_contacted_at: null, notes: "Wattly lead. Keeps crossing the 300-unit tariff slab; wants alerts before it happens.", source: "manual" },
  ].map((c) => ({ ...c, created_at: at(-10, 9) }));
}

export function demoEmails() {
  return [
    { from: "Faisal Ahmed <faisal@faisaltextiles.pk>", subject: "Re: Fabriq AI pilot, revised quote?", date: at(0, 9, 12), body: "Assalam o Alaikum Tayyab bhai, before we decide on the Fabriq AI pilot, can Inovix send a revised quote with setup included and confirm installation takes one day? We can't stop the looms longer than that." },
    { from: "Hira Khan <hira@nicfaisalabad.org>", subject: "Demo Day slot for Inovix & Co", date: at(-1, 16, 40), body: "Hi Tayyab, Inovix's Demo Day slot is confirmed for Saturday at 2:15 pm. Please send the final deck by Thursday night: 5 minutes pitch plus 3 minutes Q&A. Judges will ask about pricing, so fill in the business model slide." },
    { from: "Dr. Sana Malik <sana@alnoorclinic.pk>", subject: "Re: Clinic Assistant review today", date: at(-1, 11, 5), body: "Confirmed for 4 pm. Some patients got the same reminder twice this week. If that's fixed and reminders work in Urdu, we'd like to talk about a monthly plan." },
    { from: "Usman Tariq <principal@cityschool-fsd.edu.pk>", subject: "Kidz Lab for our students", date: at(-2, 13, 20), body: "We saw Kidz Lab. We'd like to try it with 20 grade 6 students after school. What would a one-month trial cost?" },
    { from: "Shiza Fatima <shiza@inovix.co>", subject: "Wattly: slab alert test results", date: at(-2, 19, 5), body: "Ran Wattly on my home meter for a week. Bill prediction was within 6% of the actual bill. The 300-unit slab alert fired 2 days early, which is what we want." },
  ];
}
