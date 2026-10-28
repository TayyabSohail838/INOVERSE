// Adapted from alirezarezvani/claude-skills — productivity/roast/scripts/cheapest_test_designer.py (MIT)
// Localised for Pakistani SMB customers: WhatsApp, in-person visits, PKR, local payment methods.
// Costs are rough guides, not quotes.

export const TESTS = {
  demand: {
    name: "WhatsApp + landing page smoke test",
    do: "Make a one-page site with the promise and a 'Book a free demo' button. Share it in 3-5 WhatsApp or Facebook groups where the buyer already is, or run a small boosted post aimed at the buyer's city and industry.",
    cost: "Rs 0-10,000 + a few hours",
    pass: "At least 10% of visitors leave a number, or 5+ real buyers ask for a demo within 48 hours.",
    fail: "Under 5% sign up, or only friends and students respond.",
  },
  price: {
    name: "Ask for money before building more",
    do: "Offer 3 target customers a paid pilot at your target PKR price, payable by bank transfer, JazzCash or Easypaisa, or ask for a signed pilot letter with the price written on it.",
    cost: "Rs 0",
    pass: "At least one stranger (not a friend or relative) pays or signs.",
    fail: "Everyone says 'nice idea' but nobody commits money or a signature.",
  },
  feasibility: {
    name: "Do it by hand first (concierge)",
    do: "Deliver the result manually for 1-3 real customers with no automation: e.g. inspect fabric photos yourself, or read their electricity data and send a WhatsApp report.",
    cost: "Team time only",
    pass: "You can deliver the promised result by hand and the customer says it is worth paying for.",
    fail: "Even by hand the result is weak, or it takes so long the price can never cover it.",
  },
  differentiation: {
    name: "5 in-person buyer interviews",
    do: "Visit or call 5 people who use the current alternative (manual checking, a worker, a competitor, or nothing). Ask what they hate about it and what would make them switch. Show your idea and watch the reaction.",
    cost: "Rs 0-5,000 (travel, chai)",
    pass: "The same specific reason to switch comes up 3+ times and a competitor can't copy it quickly.",
    fail: "They shrug, or 'what we do now is good enough' keeps winning.",
  },
  channel: {
    name: "One-channel reach test",
    do: "Pick ONE channel (WhatsApp outreach to 20 owners, one LinkedIn post, one industry association, one referral from an existing contact) and run it once.",
    cost: "Rs 0-5,000",
    pass: "A reply rate you could repeat every week at a cost the price can cover.",
    fail: "No replies, or the only working channel is one you can't repeat.",
  },
  retention: {
    name: "One-week repeat-use check",
    do: "Give 3-5 customers the product (or the manual version) for a week and watch if they use it again without reminders.",
    cost: "Team time only",
    pass: "Customers come back on their own or ask for next week's report.",
    fail: "Used once, then forgotten.",
  },
};

export function cheapestTest(risk, { price } = {}) {
  const test = TESTS[risk];
  if (!test) {
    throw new Error(`risk must be one of: ${Object.keys(TESTS).join(", ")}`);
  }
  const result = { risk, ...test };
  if (risk === "price" && price) {
    result.do = result.do.replace("your target PKR price", `Rs ${Number(price).toLocaleString("en-PK")}`);
  }
  return result;
}
