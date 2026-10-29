// Builds the COMPANY CONTEXT every Gemma call reads.
// From Supabase when configured, otherwise from data/company-context.md.
import fs from "node:fs/promises";
import path from "node:path";
import { dbEnabled } from "@/lib/db";
import { getCompany, listEvidence, listCommitments, listExperiments } from "@/lib/store";
import { listTasks } from "@/lib/tasks";
import { nowText, TIMEZONE } from "@/lib/google";

const day = (iso) => (iso ? String(iso).slice(0, 10) : "");

export async function buildContext() {
  const today = `Today is ${nowText()} (${TIMEZONE}).`;
  if (!dbEnabled()) {
    return today + "\n\n" + (await fs.readFile(path.join(process.cwd(), "data", "company-context.md"), "utf8"));
  }

  const [company, evidence, commitments, experiments, tasks] = await Promise.all([
    getCompany(),
    listEvidence(40),
    listCommitments(),
    listExperiments(15),
    listTasks().catch(() => []),
  ]);
  const { profile, team, products } = company;

  const lines = [];
  lines.push(`# ${profile?.name || "Our company"} — company context`, "", today, "");

  // The founder's own upcoming tasks (from marked emails and the Tasks tab)
  lines.push("## Founder's upcoming tasks");
  lines.push(
    tasks.length
      ? tasks
          .slice(0, 25)
          .map((t) => `- ${t.title}${t.due_at ? ` — due ${new Date(t.due_at).toLocaleString("en-GB", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : " — no date"}${t.notes ? ` (${t.notes.replace(/\s+/g, " ").slice(0, 160)})` : ""}`)
          .join("\n")
      : "- none"
  );
  lines.push("");
  lines.push("## Company", profile?.about || "(no description yet)", "");

  lines.push(`## Team (${team.length} ${team.length === 1 ? "person" : "people"})`);
  lines.push(team.length ? team.map((t) => `- ${t.name} — ${t.role || "role not set"}`).join("\n") : "- (no team members added)");
  lines.push("");

  lines.push("## Products");
  lines.push(
    products.length
      ? products.map((p) => `- ${p.name} (${p.stage}): ${p.description || "no description"}`).join("\n")
      : "- (no products added)"
  );
  lines.push("");

  if (commitments.length) {
    lines.push("## Current commitments");
    lines.push(
      commitments
        .map((c) => `- ${c.name} — owner: ${c.owner || "none"}; next action: ${c.next_action || "none"}; status: ${c.status}`)
        .join("\n")
    );
    lines.push("");
  }

  const running = experiments.filter((e) => e.status === "planned" || e.status === "running");
  if (running.length) {
    lines.push("## Tests not finished yet");
    lines.push(running.map((e) => `- ${e.name} (${e.status})`).join("\n"));
    lines.push("");
  }

  lines.push("## Evidence");
  lines.push("(The gap check's Investigator uses ONLY this section.)");
  lines.push(
    evidence.length
      ? evidence
          .map((e) => `- [${e.kind}] ${day(e.created_at)} ${e.title ? `${e.title}: ` : ""}${e.content.replace(/\s+/g, " ")}${e.product ? ` (product: ${e.product})` : ""}`)
          .join("\n")
      : "- none yet"
  );

  return lines.join("\n");
}
