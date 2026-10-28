---
name: weekly-review
description: Use for the weekly company check-in, when the founder asks what's stalled, what everyone is doing, or wants to reset priorities. Collects team updates, flags stalled work, scores commitment health 0-100 and ends with one goal for the week.
adapted_from: alirezarezvani/claude-skills — productivity/weekly-review (MIT), GTD three-phase loop
---

# Weekly Review — get clear, get current, get focused

Run this once a week (suggest Sunday evening or Monday morning). Timebox: 30 minutes for a small team. A review is maintenance, not judgement. If the team skipped last week, restart with a shorter pass and no guilt.

## Inputs the app supplies
- TEAM UPDATES: one short note per teammate (text, or transcribed voice note in English or Urdu).
- COMMITMENTS: list of products, client builds, applications and deadlines, each with `days_since_touched` and `next_action` (may be empty).
- COMPANY CONTEXT.

## Phase 1 — GET CLEAR
From TEAM UPDATES, extract every open loop: promised tasks, blockers, unanswered client messages, pending applications.
Sort each into exactly one bucket: `next_action`, `waiting_for` (someone else must act), `someday`, or `drop`.

## Phase 2 — GET CURRENT (all mandatory)
For every commitment:
1. Is it still alive?
2. Does it have exactly one next action with an owner?
3. Anything missed last week that must become an action now?
4. Any deadline in the next 14 days (exams, applications, client delivery)?
5. Anything we are waiting on from someone outside the team? Chase or drop.

Then call `lib/commitmentHealth.js` with the commitments. It flags STALLED (>14 days untouched), NO-NEXT-ACTION, and SOMEDAY-CANDIDATE (>45 days), and returns a 0-100 health score with HEALTHY / DRIFTING / OVERCOMMITTED. Report its verdict as is. Do not soften it.

## Phase 3 — GET FOCUSED
- Recommend which items to park or kill if the verdict is DRIFTING or OVERCOMMITTED.
- Pick ONE goal for the company this week.
- Assign tasks by role from COMPANY CONTEXT (design, full-stack, AI, security). Never assign to someone not listed.

## Output (return as JSON for the app to render)
```json
{
  "health": {"score": 0, "verdict": "", "flags": [{"item": "", "flag": ""}]},
  "done_last_week": [""],
  "stalled": [{"item": "", "why": "", "suggestion": "revive | park | kill"}],
  "waiting_for": [{"item": "", "from": "", "action": "chase | drop"}],
  "deadlines_next_14_days": [{"item": "", "date": ""}],
  "one_goal_this_week": "",
  "tasks": [{"owner": "", "task": "", "day": ""}]
}
```

## Rules
- Use only what is in TEAM UPDATES and COMMITMENTS. If something is unclear, list it under a question instead of guessing.
- Every task has one owner and one day.
- Never call the review complete if any commitment still lacks a next action or a park/kill decision.
