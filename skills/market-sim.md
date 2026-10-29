---
name: market-sim
description: Simulate how customers react to one of our existing products, or compare all products and say which one to focus on. Runs a MiroFish-style simulation (seed brief → personas → rounds → report) with Gemma.
adapted_from: the MiroFish startup-simulation method (github.com/666ghj/MiroFish, AGPL-3.0). Method only; no MiroFish code is used.
---

# Market simulation: synthetic customers, real questions

The code in `lib/simulate.js` runs this skill. Gemma plays the customers; the app computes the numbers.

## 1. Seed brief
Read from `data/product-briefs.md` (idea, target customer, current behavior, offer, assumptions) plus any evidence the team logged for the product. No personal data or secrets.

## 2. Personas
Six realistic Pakistani customers: 3-4 likely buyers from different segments, 1 skeptic, 1 decision influencer. Each has a budget and a way they solve the problem today.

## 3. Rounds
- Round 1: each persona meets the offer alone → decision (buy / pilot / maybe / no), sentiment, max price, a quote, objection, trigger.
- Round 2: they hear each other (a WhatsApp group, a trade association) and may change their mind.

## 4. Report
Segments, objections, trust barriers, triggers, price, search words, skeptical / base / optimistic cases, fragile assumptions, 5 hypotheses to test with real people, and one 48-hour test.

## Scores (computed in code, not by the model)
- Market pull = 55% decisions (buy 1, pilot 0.75, maybe 0.35, no 0) + 45% sentiment, out of 10.
- Compare score = 50% market pull + 30% ease of the first sale + 20% product readiness (stage).

## Rules
- Synthetic customers are an assumption generator, not proof of demand. Never present the result as market size.
- Turn the strongest pattern into a real test: an interview, a landing page, a paid pilot or a pre-order.
- Keep runs small (6 personas, 2 rounds) to stay inside free AI quotas.
