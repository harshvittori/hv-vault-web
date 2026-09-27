/* The 2-minute apply rule: the single source for HV Vault and Harsh Reset.
   The rule text and the check are both generated from RULE below, so they cannot disagree.
   HV Vault bundles this file (import "./shared/apply-rule.js"); the Pages build also copies it
   to /hv-vault-web/shared/apply-rule.js, which Harsh Reset loads with a plain <script> tag.
   Plain browser script: no imports or exports; it defines window.HVApplyRule. */
(function () {
  if (typeof window === "undefined" || window.HVApplyRule) return;

  const RULE = {
    roles: [
      { label: "GTM", long: "GTM, Go-to-market", ask: 1, re: "gtm|go[- ]to[- ]market" },
      { label: "growth", long: "Growth", ask: 0, re: "growth" },
      { label: "founder's office", long: "Founder's Office", re: "founder'?s office" },
      { label: "BD", long: "Business Development", re: "business development|bd[ar]?" },
      { label: "partnerships", long: "Partnerships", re: "partnerships?" },
      { label: "rev ops", long: "Revenue Operations", re: "rev(enue)?[ -]?ops|revenue operations" },
    ],
    maxYears: 3,
    places: [
      { label: "Delhi NCR", long: "Delhi, Gurgaon, Noida", re: "delhi|ncr|gurgaon|gurugram|noida" },
      { label: "Jaipur", long: "Jaipur", re: "jaipur" },
      { label: "Agra", long: "Agra", re: "agra" },
      { label: "remote", long: "remote", re: "remote" },
    ],
    strongFit: [
      { label: "Bengaluru", re: "bengaluru|bangalore" },
      { label: "Pune", re: "pune" },
    ],
    never: [{ label: "Mumbai", re: "mumbai" }],
    stories: "Real stories for 2 of the top 3 duties. Don't read \"nice to have\".",
  };

  const list = (a, last) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + (last || " or ") + a[a.length - 1]);
  const anyRe = (items) => new RegExp(items.map((x) => x.re).join("|"), "i");
  const roleRe = new RegExp("\\b(" + RULE.roles.map((r) => r.re).join("|") + ")\\b", "i");
  const placeRe = anyRe(RULE.places), fitRe = anyRe(RULE.strongFit), neverRe = anyRe(RULE.never);
  const fitNames = list(RULE.strongFit.map((x) => x.label)), neverNames = list(RULE.never.map((x) => x.label));

  // Rule text, generated from RULE
  const summary = [
    "Role family: " + RULE.roles.map((r) => r.label).join(", ") + ".",
    "Minimum experience " + RULE.maxYears + " years or less. Skip if it's " + (RULE.maxYears + 1) + "+.",
    RULE.places.map((p) => p.label).join(", ") + ". " + fitNames + " only for a strong fit. No " + neverNames + ".",
    RULE.stories,
  ];
  const checkSteps = [
    "Is the title about " + list(RULE.roles.slice().sort((a, b) => (a.ask ?? 9) - (b.ask ?? 9)).map((r) => r.long)) + "?",
    "Does it ask for " + RULE.maxYears + " years or less? '0-2', '1-3' and '2-4 years' are all fine.",
    "Is it in " + list(RULE.places.map((p) => p.long), ", or ") + "? " + fitNames + " only if it fits very well. Never " + neverNames + ".",
  ];
  const skipLine = "Asks for " + (RULE.maxYears + 1) + "+ years, or it's in " + neverNames + ": skip it and open the next job.";

  // The check. job: { title, description, experience_required, location, work_mode }
  function check(job) {
    const f = job || {};
    const title = (f.title || "") + " " + (f.description || "").slice(0, 300);
    const role = roleRe.test(title) ? "pass" : "warn";
    const expText = (f.experience_required || "") + " " + (f.description || "");
    const m = expText.match(/(\d{1,2})\s*(?:\+|-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)/i);
    const exp = !m ? "warn" : Number(m[1]) > RULE.maxYears ? "fail" : "pass";
    const loc = ((f.location || "") + " " + (f.work_mode || "")).toLowerCase();
    const place = neverRe.test(loc) ? "fail" : placeRe.test(loc) ? "pass" : "warn";
    const rows = [
      ["Role family", role, role === "pass" ? RULE.roles.map((r) => r.label).join(" / ") : "Title doesn't clearly match your role family"],
      ["Experience", exp, exp === "fail" ? "Asks " + (RULE.maxYears + 1) + "+ years. Skip." : exp === "pass" ? RULE.maxYears + " years or less" : "Not stated. Check the JD"],
      ["Location", place, place === "fail" ? neverNames + ". Skip." : place === "pass" ? "In your list" : fitRe.test(loc) ? fitNames.replace(" or ", "/") + ": only for a strong fit" : "Outside your list or not set"],
      ["Stories", "warn", "Do you have real stories for 2 of the top 3 duties?"],
    ];
    const verdict = rows.some((r) => r[1] === "fail") ? "fail" : rows.slice(0, 3).every((r) => r[1] === "pass") ? "pass" : "warn";
    return { rows, verdict };
  }

  window.HVApplyRule = { version: 1, rule: RULE, summary, checkSteps, skipLine, check };
})();
