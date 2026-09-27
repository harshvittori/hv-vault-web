/* HV AI command test set: 24 commands (Hinglish, Hindi, English, voice-style run-ons, ambiguous
   names, deletes, relative dates). Each check looks only at the parsed + validated + resolved
   actions; nothing is executed. Used by HV Vault > Settings > "HV AI self-test" with the user's
   own key, and by the Node tests. Fixed data and a fixed "now" make the expectations exact. */
(function (root) {
  if (!root || root.HVAI_TESTS) return;
  const NOW = { date: "2026-09-28", time: "11:00", weekday: "Monday" };   // kal 29 Tue, parso 30 Wed, next Monday 5 Oct
  const DATA = {
    companies: [{ id: "c1", name: "Swiggy" }, { id: "c2", name: "Cred" }, { id: "c3", name: "Zomato" }, { id: "c4", name: "Meesho" }, { id: "c5", name: "Groww" }],
    jobs: [
      { id: "j1", title: "Growth Associate", company_id: "c1", status: "Saved" },
      { id: "j2", title: "BD Manager", company_id: "c1", status: "Preparing" },
      { id: "j3", title: "Founder's Office Associate", company_id: "c2", status: "Saved" },
      { id: "j4", title: "Partnerships Lead", company_id: "c3", status: "Applied", date_applied: "2026-09-24" },
      { id: "j5", title: "Growth Analyst", company_id: "c4", status: "Saved" },
      { id: "j6", title: "GTM Associate", company_id: "c5", status: "Applied", date_applied: "2026-09-28" },
    ],
    followups: [{ id: "f1", title: "First follow-up", company_id: "c5", job_id: "j6", due_date: "2026-09-28", status: "Pending" }],
    calendarEvents: [],
  };
  const PLAN = { date: "2026-09-28", blocks: [
    { id: "apply1", start: "13:00", duration_min: 60, title: "Send 5 applications", kind: "apply", core: true },
    { id: "lunch", start: "14:00", duration_min: 30, title: "Lunch", kind: "meal", core: false },
    { id: "prep", start: "14:30", duration_min: 60, title: "Interview prep", kind: "prep", core: true },
    { id: "free", start: "19:00", duration_min: 180, title: "Free time", kind: "free", core: false },
  ] };

  const of = (res, type) => res.filter((r) => r.action && r.action.type === type);
  const ready = (res, type) => of(res, type).filter((r) => r.status === "ready");
  const mutating = (res) => res.filter((r) => r.action && ["answer", "askClarification"].indexOf(r.action.type) < 0);
  const lc = (s) => String(s || "").toLowerCase();
  const asks = (res) => of(res, "askClarification").length > 0;
  const T = (cmd, lang, check) => ({ cmd, lang, check });
  const pass = (c, why) => [!!c, why];
  const min = (hhmm) => { const m = /^(\d+):(\d+)$/.exec(hhmm || ""); return m ? +m[1] * 60 + +m[2] : NaN; };

  const TESTS = [
    T("Razorpay ka GTM Associate role add karo, LinkedIn pe mila, link ye hai https://www.linkedin.com/jobs/view/4012345678", "Hinglish", (r) => {
      const a = ready(r, "addJob")[0]; return pass(a && /razorpay/.test(lc(a.action.args.company)) && /gtm/.test(lc(a.action.args.role)) && /linkedin/.test(lc(a.action.args.source)) && /4012345678/.test(a.action.args.link || ""), "addJob Razorpay · GTM Associate · LinkedIn · link"); }),
    T("Swiggy wala job hata do", "Hinglish · ambiguous delete", (r) => pass(!ready(r, "deleteJob").length && (of(r, "deleteJob").some((x) => x.status === "choose") || asks(r)), "two Swiggy jobs → asks which, deletes nothing")),
    T("Cred wale ko applied mark karo aur 5 din baad follow-up laga do", "Hinglish", (r) => {
      const m = ready(r, "moveStage")[0], f = ready(r, "addFollowUp")[0];
      return pass(m && m.action.args.job_id === "j3" && m.action.args.stage === "Applied" && f && f.action.args.job_id === "j3" && f.action.args.due_date === "2026-10-03", "moveStage Cred → Applied + follow-up on 3 Oct"); }),
    T("Kal 4 baje Zomato ka interview hai", "Hinglish · relative date", (r) => {
      const e = ready(r, "addEvent")[0]; return pass(e && e.action.args.date === "2026-09-29" && e.action.args.time === "16:00" && e.action.args.type === "interview", "interview event 29 Sep 16:00"); }),
    T("Aaj ka schedule bana do: 3 ghante apply, 1 ghanta interview prep, shaam 7 ke baad free", "Hinglish · plan", (r) => {
      const p = ready(r, "buildDayPlan")[0]; if (!p) return pass(false, "no ready buildDayPlan");
      const b = p.action.args.blocks, total = (k) => b.filter((x) => x.kind === k).reduce((s, x) => s + x.duration_min, 0);
      const free = b.find((x) => x.kind === "free");
      return pass(p.action.args.date === "2026-09-28" && total("apply") >= 150 && total("prep") >= 45 && free && min(free.start) >= 19 * 60 - 1 && b.some((x) => x.kind === "meal"), "today: ~3h apply, ~1h prep, free from 19:00, meals kept"); }),
    T("Aaj kitne apply kiye aur kaunse follow-ups pending hain?", "Hinglish · question", (r) => {
      const a = of(r, "answer")[0]; return pass(a && /\b1\b|one|ek/i.test(a.action.args.text) && /groww/i.test(a.action.args.text) && !mutating(r).length, "answers 1 applied + Groww follow-up, changes nothing"); }),
    T("Add a Business Development Associate role at Meesho from Naukri", "English", (r) => {
      const a = ready(r, "addJob")[0]; return pass(a && /meesho/.test(lc(a.action.args.company)) && /business development/.test(lc(a.action.args.role)) && /naukri/.test(lc(a.action.args.source)), "addJob Meesho · BD Associate · Naukri"); }),
    T("मीशो वाली जॉब को इंटरव्यू स्टेज में डालो", "Hindi", (r) => {
      const m = ready(r, "moveStage")[0]; return pass(m && m.action.args.job_id === "j5" && m.action.args.stage === "Interview", "moveStage Meesho → Interview"); }),
    T("Groww ka follow-up done kar do", "Hinglish", (r) => {
      const f = ready(r, "completeFollowUp")[0]; return pass(f && f.action.args.followup_id === "f1", "completeFollowUp Groww"); }),
    T("parso 11 baje Razorpay ke saath recruiter call hai", "Hinglish · relative date", (r) => {
      const e = ready(r, "addEvent")[0]; return pass(e && e.action.args.date === "2026-09-30" && e.action.args.time === "11:00", "event 30 Sep 11:00"); }),
    T("next Monday ko Cred ka assignment submit karna hai", "Hinglish · next Monday", (r) => {
      const e = ready(r, "addEvent")[0]; return pass(e && e.action.args.date === "2026-10-05", "event on Mon 5 Oct"); }),
    T("haan toh suno na woh jo Zomato wala partnerships lead tha na usko rejected kar do yaar unka mail aaya tha", "Voice run-on", (r) => {
      const m = ready(r, "moveStage")[0]; return pass(m && m.action.args.job_id === "j4" && m.action.args.stage === "Rejected", "moveStage Zomato → Rejected"); }),
    T("swiggy growth associate applied", "Short / voice", (r) => {
      const m = ready(r, "moveStage")[0]; return pass(m && m.action.args.job_id === "j1" && m.action.args.stage === "Applied", "moveStage Swiggy Growth Associate → Applied"); }),
    T("Delete the Cred job", "English · delete", (r) => {
      const d = ready(r, "deleteJob")[0]; return pass(d && d.action.args.job_id === "j3", "deleteJob Cred (card needs Delete confirm)"); }),
    T("Meesho wale role ka link update karo https://meesho.io/jobs/ga-22", "Hinglish", (r) => {
      const u = ready(r, "updateJob")[0]; return pass(u && u.action.args.job_id === "j5" && /meesho\.io\/jobs\/ga-22/.test(u.action.args.link || ""), "updateJob Meesho link"); }),
    T("Flipkart wala job hata do", "Hinglish · no match", (r) => pass(!ready(r, "deleteJob").length, "no Flipkart job → deletes nothing")),
    T("Remind me to follow up with Zomato in 3 days", "English", (r) => {
      const f = ready(r, "addFollowUp")[0]; return pass(f && f.action.args.job_id === "j4" && f.action.args.due_date === "2026-10-01", "follow-up Zomato on 1 Oct"); }),
    T("Aaj shaam 6 baje ek networking call hai Priya ke saath", "Hinglish", (r) => {
      const e = ready(r, "addEvent")[0]; return pass(e && e.action.args.date === "2026-09-28" && e.action.args.time === "18:00", "event today 18:00"); }),
    T("Kal ka plan bana do: subah 10 se 12 apply, lunch, 2 se 3 outreach", "Hinglish · plan", (r) => {
      const p = ready(r, "buildDayPlan")[0]; if (!p) return pass(false, "no ready buildDayPlan");
      const b = p.action.args.blocks;
      return pass(p.action.args.date === "2026-09-29" && b.some((x) => x.kind === "apply" && min(x.start) === 600) && b.some((x) => x.kind === "outreach" && Math.abs(min(x.start) - 840) <= 30) && b.some((x) => x.kind === "meal"), "tomorrow: apply 10:00, outreach ~14:00, lunch"); }),
    T("Interview prep wala block 30 minute chhota kar do", "Hinglish · edit plan", (r) => {
      const p = ready(r, "editDayPlan")[0]; if (!p) return pass(false, "no ready editDayPlan");
      const b = p.action.args.blocks, prep = b.find((x) => x.block_id === "prep" || /prep/i.test(x.title)), apply = b.find((x) => x.block_id === "apply1" || /application/i.test(x.title));
      return pass(prep && prep.duration_min <= 35 && apply && b.some((x) => x.kind === "meal"), "prep shortened to ~30 min; applications and lunch kept"); }),
    T("hi", "Greeting", (r) => pass(of(r, "answer").length && !mutating(r).length, "just a reply")),
    T("Cred ke saath interview schedule karo", "Missing date", (r) => pass(!ready(r, "addEvent").length && (asks(r) || of(r, "answer").length), "asks when, adds nothing")),
    T("Zomato interview kal 3 baje aur Swiggy BD manager ko interview stage mein daal do", "Hinglish · two actions", (r) => {
      const e = ready(r, "addEvent")[0], m = ready(r, "moveStage")[0];
      return pass(e && e.action.args.date === "2026-09-29" && e.action.args.time === "15:00" && m && m.action.args.job_id === "j2" && m.action.args.stage === "Interview", "event 29 Sep 15:00 + Swiggy BD Manager → Interview"); }),
    T("Is hafte kitne applications gaye?", "Hinglish · question", (r) => {
      const a = of(r, "answer")[0]; return pass(a && /\b2\b|two|do\b/i.test(a.action.args.text) && !mutating(r).length, "answers 2 this week"); }),
  ];

  /* run one command through the real model and the same prepare path the widget uses */
  async function runOne(HVAI, cfg, t) {
    const ctx = HVAI.buildContext(DATA, PLAN, NOW);
    const t0 = Date.now(); const r = await HVAI.interpret(cfg, t.cmd, ctx, []);
    if (r.error) return { ok: false, why: r.error, actions: [], ms: Date.now() - t0 };
    const res = (r.actions || []).map((a) => {
      if ((a.type === "buildDayPlan" || a.type === "editDayPlan") && HVAI.validate(a).ok) {
        const f = HVAI.fixPlan(a.args.blocks, a.type === "editDayPlan" ? PLAN.blocks : null);
        return { status: "ready", action: { type: a.type, args: Object.assign({}, a.args, { blocks: f.blocks }) } };
      }
      return HVAI.resolve(a, DATA, { today: NOW.date });
    });
    const [ok, why] = t.check(res);
    return { ok, why, actions: res, ms: Date.now() - t0 };
  }
  root.HVAI_TESTS = { NOW, DATA, PLAN, TESTS, runOne };
})(typeof window !== "undefined" ? window : globalThis);
