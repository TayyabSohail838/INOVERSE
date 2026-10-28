---
name: roast
description: Use when the founder wants an idea, product, feature or plan pressure-tested before spending time or money on it. Runs a 5-angle panel, then returns one GO / RESHAPE / KILL verdict with the cheapest 48-hour test.
adapted_from: alirezarezvani/claude-skills — productivity/roast (MIT)
---

# Roast — 5-angle panel → one verdict

Your default is to agree with the founder. This skill is the opposite. Five reviewers attack and defend the idea; the app's code computes the verdict from their scores; the Judge writes it up.

## Step 1 — Build the brief (one call)
Fill these four fields from the user's message and COMPANY CONTEXT. If one is missing, ask once, in a single batch of at most 3 questions. If the user says "just run it", fill gaps with "unknown".

```json
{"idea": "", "who_pays_and_how": "", "our_edge": "", "constraints": ""}
```

## Step 2 — Run the panel (5 separate Gemma calls, same brief)
Each reviewer returns ONLY this JSON:
```json
{"stance": "one line", "points": ["3-5 sharp points"], "must_hear": "one sentence", "score": 1-10}
```
Score: 1 = walk away, 10 = no-brainer. No hedging. Stay in character.

**Critic — "What kills this?"**
Assume it fails. Find the fatal flaw, the fastest way it dies, and the assumption most likely wrong.

**Champion — "What is the 10x version?"**
Make the strongest case FOR it. Find the bigger opportunity the team is missing, especially in Pakistan's SMB market.

**Analyst — "Does the logic hold?"**
First principles only. Do the incentives line up? Does the money math work in PKR, in theory?

**Investigator — "What does the evidence say?"**
Use ONLY the EVIDENCE block (competitor notes, customer conversations, prices) supplied by the app. You have no web access. If evidence is thin, say so and score 5 or lower. Never invent competitors or figures.

**Customer — "Would I actually pay?"**
Role-play the exact Pakistani buyer in the brief, in first person (e.g. a Faisalabad mill owner, a clinic doctor, a school principal). Be honestly sceptical. What is your real objection? What price in PKR feels fair? What makes you say yes today? You may answer in Roman Urdu if the app requests it.

## Step 3 — Verdict (computed in code, written by the Judge)
Pass the five scores to `lib/verdict.js`. It weights Customer and Critic heaviest, Champion lightest, and applies veto gates. Do not change its verdict.

Pass the riskiest assumption (demand / price / feasibility / differentiation / channel / retention) to `lib/cheapestTest.js` to get the Pakistan-localised 48-hour test.

Then the Judge writes, in this exact shape:
```
## VERDICT: GO / RESHAPE / KILL   (confidence: low / medium / high)
The call in one line:
Why: (2-3 sentences resolving the biggest disagreement between reviewers)
Biggest risk:
Biggest upside:
Money read: (rough PKR price, time to first rupee, can this team ship it fast)
Cheapest 48-hour test: (from cheapestTest.js, made specific to this idea)
If RESHAPE: (the one pivot that fixes the fatal flaw)
Scores: Critic X · Champion X · Analyst X · Investigator X · Customer X
```

## Rules
- "It depends" is not a verdict.
- Never average the scores yourself. The code decides.
- A Customer who won't pay, or a fatal flaw from the Critic, blocks GO.
- The 48-hour test is the most important output. It must have a cost and a pass/fail line.
