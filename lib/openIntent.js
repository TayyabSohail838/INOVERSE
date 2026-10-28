// Detects "open a website" and "search for X" commands, in English or Roman Urdu.
// No AI call: fast, and the URL is always built here, never taken from the model,
// so a misheard sentence can only ever open a normal web page.

const SITES = {
  youtube: ["YouTube", "https://www.youtube.com"],
  google: ["Google", "https://www.google.com"],
  gmail: ["Gmail", "https://mail.google.com"],
  "google drive": ["Google Drive", "https://drive.google.com"],
  drive: ["Google Drive", "https://drive.google.com"],
  "google docs": ["Google Docs", "https://docs.google.com"],
  calendar: ["Google Calendar", "https://calendar.google.com"],
  "google calendar": ["Google Calendar", "https://calendar.google.com"],
  maps: ["Google Maps", "https://maps.google.com"],
  "google maps": ["Google Maps", "https://maps.google.com"],
  "ai studio": ["Google AI Studio", "https://aistudio.google.com"],
  "google ai studio": ["Google AI Studio", "https://aistudio.google.com"],
  github: ["GitHub", "https://github.com"],
  vercel: ["Vercel", "https://vercel.com/dashboard"],
  supabase: ["Supabase", "https://supabase.com/dashboard"],
  linkedin: ["LinkedIn", "https://www.linkedin.com"],
  whatsapp: ["WhatsApp Web", "https://web.whatsapp.com"],
  "whatsapp web": ["WhatsApp Web", "https://web.whatsapp.com"],
  facebook: ["Facebook", "https://www.facebook.com"],
  instagram: ["Instagram", "https://www.instagram.com"],
  twitter: ["X", "https://x.com"],
  x: ["X", "https://x.com"],
  "stack overflow": ["Stack Overflow", "https://stackoverflow.com"],
  stackoverflow: ["Stack Overflow", "https://stackoverflow.com"],
  "hugging face": ["Hugging Face", "https://huggingface.co"],
  huggingface: ["Hugging Face", "https://huggingface.co"],
  claude: ["Claude", "https://claude.ai"],
  // Company links: edit these to match your own
  "our website": ["Inovix website", "https://inovix-and-co.vercel.app"],
  inovix: ["Inovix website", "https://inovix-and-co.vercel.app"],
  "inovix website": ["Inovix website", "https://inovix-and-co.vercel.app"],
};

const google = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const youtube = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// Strip politeness and filler so "please open youtube for me" → "youtube"
function clean(s) {
  return s
    .toLowerCase()
    .replace(/[?!,"']/g, " ")
    .replace(/\.(\s|$)/g, " ") // a full stop ends a sentence; a dot inside "daraz.pk" stays
    .replace(/\b(please|plz|can you|could you|for me|zara|jaldi)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FILLER = /\b(the|website|site|page|app)\b/g;

function siteFor(name) {
  const key = clean(name);
  const bare = key.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  for (const k of [key, bare]) {
    if (SITES[k]) return { label: SITES[k][0], url: SITES[k][1] };
  }
  // Something that looks like a domain, e.g. "daraz.pk" or "github.com/anthropics"
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(key)) {
    return { label: key, url: `https://${key}` };
  }
  return null;
}

export function detectOpenIntent(message) {
  const m = clean(message);
  let match;

  // YouTube search: "search youtube for X", "play X on youtube", "youtube par X search karo"
  if (
    (match = m.match(/^(?:search|find|look up) (?:on )?youtube for (.+)$/)) ||
    (match = m.match(/^play (.+?) on youtube$/)) ||
    (match = m.match(/^youtube (?:par|pe|per) (.+?) (?:search karo|dhoondo|chalao|lagao)$/))
  ) {
    const q = match[1].trim();
    return { url: youtube(q), label: `YouTube: ${q}`, kind: "search" };
  }

  // Google search: "search for X", "google X", "search X on google", "X google karo"
  if (
    (match = m.match(/^(?:search|look up|find) (?:on )?google for (.+)$/)) ||
    (match = m.match(/^(?:search|look up) (?:for )?(.+?)(?: on google)?$/)) ||
    (match = m.match(/^google (.+)$/)) ||
    (match = m.match(/^(.+?) (?:google|search) karo$/)) ||
    (match = m.match(/^google (?:par|pe|per) (.+?) (?:search karo|dhoondo)$/))
  ) {
    const q = match[1].trim();
    if (q && !SITES[q]) return { url: google(q), label: `Google: ${q}`, kind: "search" };
  }

  // Open a site: "open X", "go to X", "launch X", "X kholo", "X open karo"
  if (
    (match = m.match(/^(?:open|go to|launch|take me to) (.+)$/)) ||
    (match = m.match(/^(.+?) (?:kholo|khol do|open karo|open kar do|par jao)$/))
  ) {
    const site = siteFor(match[1]);
    if (site) return { ...site, kind: "open" };
    // Unknown name: search for it rather than guessing a URL
    const q = match[1].trim();
    return { url: google(q), label: `Google: ${q}`, kind: "search" };
  }

  return null;
}

export function openReply(intent, lang = "en") {
  const ur = lang === "ur";
  if (intent.kind === "open") {
    return ur ? `${intent.label} khol raha hoon.` : `Opening ${intent.label}.`;
  }
  return ur ? `Search kar raha hoon: ${intent.label.split(": ")[1]}.` : `Searching ${intent.label}.`;
}
