// The executives Inovo speaks as. You run the company; each answer comes from one of them.
// The globe takes the colour of whoever is speaking, and every answer starts with "<role> here".
// The role follows the skill that answered (or the panel you opened); you can also pick one
// yourself from the bottom-left corner.
export const ROLES = [
  { key: "cofounder", label: "Cofounder", area: "Your all-round partner", color: "#d9dcff", color2: "#8b93ff" },
  { key: "ceo", label: "CEO", area: "Strategy & fundraising", color: "#b69bff", color2: "#6d4bff" },
  { key: "cto", label: "CTO", area: "Tech & engineering", color: "#4cc9ff", color2: "#2a6bff" },
  { key: "cfo", label: "CFO", area: "Finance & pricing", color: "#ffcf5a", color2: "#ff8a1f" },
  { key: "cmo", label: "CMO", area: "Marketing & brand", color: "#ff7ac8", color2: "#c43dff" },
  { key: "coo", label: "COO", area: "Operations & tasks", color: "#ff9b6a", color2: "#ff4d4d" },
  { key: "hr", label: "HR", area: "People & hiring", color: "#5cf0b0", color2: "#14b8a6" },
  { key: "cpo", label: "CPO", area: "Product & roadmap", color: "#c2f25c", color2: "#5fae14" },
  { key: "cro", label: "CRO", area: "Sales & revenue", color: "#3ee6d8", color2: "#0e8fa8" },
  { key: "ciso", label: "CISO", area: "Security & data", color: "#a9c1d9", color2: "#4a6a8c" },
  { key: "legal", label: "Legal", area: "Contracts & compliance", color: "#ead7b0", color2: "#a8803c" },
  { key: "staff", label: "Chief of Staff", area: "Inbox, links & errands", color: "#f2f2f2", color2: "#9a9aa8" },
  { key: "investor", label: "Investor", area: "Gap check & evidence", color: "#ff6b7d", color2: "#d61f69" },
];

export const roleByKey = (key) => ROLES.find((r) => r.key === key) || ROLES[0];

// which executive answers for each skill
const SKILL_ROLE = {
  "solo-founder": "cofounder",
  "ceo-advisor": "ceo",
  "cto-advisor": "cto",
  "client-scope": "cto",
  "cfo-advisor": "cfo",
  "pricing-strategist": "cfo",
  "cmo-advisor": "cmo",
  "market-sim": "cmo",
  "coo-advisor": "coo",
  "weekly-review": "coo",
  "chro-advisor": "hr",
  "cpo-advisor": "cpo",
  "cro-advisor": "cro",
  "ciso-advisor": "ciso",
  "general-counsel": "legal",
  "open-website": "staff",
  email: "staff",
  roast: "investor",
};

// which role goes with each panel in the dock
const PANEL_ROLE = {
  tasks: "coo",
  people: "cro",
  simulate: "cmo",
  evidence: "investor",
  tests: "investor",
  weekly: "coo",
  company: "ceo",
};

export const roleForSkill = (skill) => SKILL_ROLE[skill] || null;
export const roleForPanel = (panel) => PANEL_ROLE[panel] || null;

// The spoken line that says who is talking, e.g. "CFO here."
export function roleIntro(skill, lang = "en") {
  const r = roleByKey(roleForSkill(skill));
  if (lang === "ur") return `${r.label} baat kar raha hai.`;
  return `${r.label} here.`;
}
