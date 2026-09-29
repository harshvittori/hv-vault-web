/* HV AI: one assistant for HV Vault and HV Reset.
   Plain browser script (no imports/exports) that defines window.HVAI. HV Vault bundles it
   (import "./shared/hv-ai.js"); the Pages build also publishes it at /hv-vault-web/shared/hv-ai.js
   for HV Reset. The model only PROPOSES actions from a fixed list (function calling); every
   action is validated, references are resolved against the app's data (ambiguity -> a question),
   shown as a card, and only the host app executes what the user confirms. */
(function (root) {
  if (!root || root.HVAI) return;

  /* ---------------- constants ---------------- */
  const STAGES = ["Wishlist", "Saved", "Preparing", "Applied", "Follow-up Needed", "Recruiter Responded", "Interview", "Assignment", "Final Round", "Offer", "Rejected", "Closed"];
  const EVENT_TYPES = ["interview", "assignment", "networking", "recruiter", "research", "followup", "application", "custom"];
  const EVENT_LABEL = { interview: "Interview", assignment: "Assignment / deadline", networking: "Networking call", recruiter: "Recruiter call", research: "Company research", followup: "Follow-up", application: "Application", custom: "Event" };
  const FU_TYPES = ["Email", "LinkedIn", "Call", "WhatsApp", "Other"];
  const PRIORITIES = ["Low", "Medium", "High"];
  const BLOCK_KINDS = ["apply", "prep", "outreach", "work", "meal", "rest", "free", "close"];
  const ACTIONS = ["addJob", "updateJob", "moveStage", "deleteJob", "addFollowUp", "completeFollowUp", "addEvent", "buildDayPlan", "editDayPlan", "deleteTasks", "clearPlans", "answer", "askClarification"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /* ---------------- dates (India time) ---------------- */
  const pad = (n) => String(n).padStart(2, "0");
  function istNow(d) {
    const parts = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d || new Date()).forEach((p) => { parts[p.type] = p.value; });
    const date = parts.year + "-" + parts.month + "-" + parts.day;
    return { date, time: (parts.hour === "24" ? "00" : parts.hour) + ":" + parts.minute, weekday: DAYS[new Date(date + "T12:00:00Z").getUTCDay()] };
  }
  const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const weekdayOf = (iso) => DAYS[new Date(iso + "T12:00:00Z").getUTCDay()];
  const niceDate = (iso) => { if (!iso) return ""; const t = new Date(iso + "T12:00:00Z"); return weekdayOf(iso).slice(0, 3) + ", " + t.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()]; };
  const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  const hhmm = (min) => pad(Math.floor(((min % 1440) + 1440) % 1440 / 60)) + ":" + pad(((min % 60) + 60) % 60);
  /* any 24-hour time in a sentence ("17:25", "9:05") becomes 12-hour ("5:25 PM"); leaves "5:25 PM" alone */
  const to12 = (text) => String(text == null ? "" : text).replace(/(^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?!\d|:\d|\s*[ap]\.?m\b)/gi, (m, pre, h, mi) => pre + niceTime(h + ":" + mi).replace(" ", "\u00a0"));   // keep "5:45 PM" on one line
  const niceTime = (t) => { const m = toMin(t); if (isNaN(m)) return ""; let h = Math.floor(m / 60); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + pad(m % 60) + " " + ap; };
  /* phrases the model must map to dates; computed here so "kal", "parso", "next Monday" never drift */
  function dateHints(today) {
    const h = { today, "kal / tomorrow": addDays(today, 1), "parso / day after tomorrow": addDays(today, 2), "kal (past, 'kal kiya')": addDays(today, -1) };
    for (let i = 1; i <= 7; i++) { const d = addDays(today, i); h["next " + weekdayOf(d) + " / agle " + weekdayOf(d) + " / " + weekdayOf(d)] = d; }
    return h;
  }

  /* ---------------- compact context ---------------- */
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\b(wala|wale|wali|walla|ka|ki|ke|company|job|role|the)\b/g, " ").replace(/\s+/g, " ").trim();
  function buildContext(data, plan, now) {
    const d = data || { jobs: [], companies: [], followups: [], calendarEvents: [] };
    const n = now || istNow();
    const cname = {}; (d.companies || []).forEach((c) => { cname[c.id] = c.name; });
    const active = (d.jobs || []).slice().sort((a, b) => String(b.updated_at || b.date_saved || "").localeCompare(String(a.updated_at || a.date_saved || ""))).slice(0, 200);
    const until = addDays(n.date, 14), weekStart = addDays(n.date, -((DAYS.indexOf(n.weekday) + 6) % 7));
    const pending = (d.followups || []).filter((f) => f.status === "Pending");
    return {
      now: { date: n.date, time: n.time, weekday: n.weekday, timezone: "Asia/Kolkata" },
      date_hints: dateHints(n.date),
      stages: STAGES,
      jobs: active.map((j) => ({ id: j.id, role: j.title, company: cname[j.company_id] || "", stage: j.status, applied: j.date_applied || undefined, link: j.job_link ? "yes" : undefined })),
      followups_pending: pending.slice(0, 60).map((f) => ({ id: f.id, title: f.title, company: cname[f.company_id] || "", job_id: f.job_id || undefined, due: f.due_date || undefined })),
      events_next_14_days: (d.calendarEvents || []).filter((e) => e.date && e.date >= n.date && e.date <= until && e.status !== "cancelled").slice(0, 40).map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time || undefined, type: e.type })),
      today_plan: plan && plan.blocks ? { date: plan.date, blocks: plan.blocks.map((b) => ({ block_id: b.id, start: b.start, duration_min: b.duration_min, title: b.title, kind: b.kind, core: !!b.core, done: b.done || undefined })) } : null,
      stats: {
        applied_today: (d.jobs || []).filter((j) => j.date_applied === n.date).length,
        applied_this_week: (d.jobs || []).filter((j) => j.date_applied && j.date_applied >= weekStart && j.date_applied <= n.date).length,   // weeks start on Monday
        week_starts: weekStart,
        applied_last_7_days: (d.jobs || []).filter((j) => j.date_applied && j.date_applied > addDays(n.date, -7) && j.date_applied <= n.date).length,
        followups_due_or_overdue: pending.filter((f) => f.due_date && f.due_date <= n.date).length,
      },
    };
  }

  /* ---------------- the fixed action list (function declarations) ---------------- */
  const S = (type, description, extra) => Object.assign({ type, description }, extra || {});
  const JOBREF = {
    job_id: S("string", "Exact job id from context.jobs when you can identify one job."),
    company: S("string", "Company name as the user said it (used to find the job)."),
    role: S("string", "Role/title words as the user said them (used to find the job)."),
  };
  const BLOCK = S("object", "One block. One block = one task.", {
    properties: {
      block_id: S("string", "For editDayPlan: the block_id of an existing block you keep or change."),
      start: S("string", "Start time HH:MM, 24-hour, India time."),
      duration_min: S("integer", "Length in minutes."),
      title: S("string", "One task only, e.g. 'Send applications' (never two tasks in one title)."),
      kind: S("string", "Block type.", { enum: BLOCK_KINDS }),
      core: S("boolean", "true for must-do work (applying, interview prep, outreach)."),
    },
    required: ["start", "duration_min", "title", "kind"],
  });
  const TOOLS = [
    { name: "addJob", description: "Add a new job to HV Vault.", parameters: S("object", "", { properties: {
      company: S("string", "Company name."), role: S("string", "Role / job title."), link: S("string", "Job link (URL) if given."),
      source: S("string", "Where it was found, e.g. LinkedIn, Naukri, Referral, Company site."), location: S("string", "City or Remote, if given."),
      stage: S("string", "Starting stage; default Saved. Use Applied only if the user says they already applied.", { enum: STAGES }), notes: S("string", "Extra notes."),
    }, required: ["company", "role"] }) },
    { name: "updateJob", description: "Change details of an existing job (not its stage).", parameters: S("object", "", { properties: Object.assign({}, JOBREF, {
      new_title: S("string", "New role title."), link: S("string", "New job link."), source: S("string", "New source."), location: S("string", "New location."),
      priority: S("string", "Priority.", { enum: PRIORITIES }), deadline: S("string", "Application deadline YYYY-MM-DD."), notes: S("string", "Note to add."),
    }) }) },
    { name: "moveStage", description: "Move an existing job to another pipeline stage (e.g. applied, interview, rejected). Moving to Applied also creates its first follow-up automatically.", parameters: S("object", "", { properties: Object.assign({}, JOBREF, {
      stage: S("string", "Target stage.", { enum: STAGES }),
    }), required: ["stage"] }) },
    { name: "deleteJob", description: "Delete an existing job (the user said delete/remove/hata do).", parameters: S("object", "", { properties: Object.assign({}, JOBREF) }) },
    { name: "addFollowUp", description: "Schedule a follow-up for a job. Use in_days for 'N din baad / in N days', otherwise due_date.", parameters: S("object", "", { properties: Object.assign({}, JOBREF, {
      in_days: S("integer", "Days from today (e.g. 5 for '5 din baad')."), due_date: S("string", "Due date YYYY-MM-DD (from date_hints)."),
      title: S("string", "Short follow-up title."), type: S("string", "Channel.", { enum: FU_TYPES }), notes: S("string", "Notes."),
    }) }) },
    { name: "completeFollowUp", description: "Mark a pending follow-up done.", parameters: S("object", "", { properties: {
      followup_id: S("string", "Exact id from context.followups_pending."), company: S("string", "Company of the follow-up."), title: S("string", "Words from its title."),
    } }) },
    { name: "addEvent", description: "Add a calendar event (interview, call, deadline).", parameters: S("object", "", { properties: Object.assign({}, JOBREF, {
      title: S("string", "Event title, e.g. 'Zomato interview'."), date: S("string", "YYYY-MM-DD, taken from date_hints for kal/parso/weekdays."),
      time: S("string", "HH:MM 24-hour India time, e.g. 16:00 for '4 baje' in the afternoon."), duration_min: S("integer", "Length in minutes if said."),
      type: S("string", "Event type.", { enum: EVENT_TYPES }), notes: S("string", "Notes."),
    }), required: ["title", "date"] }) },
    { name: "buildDayPlan", description: "Make a new HV Reset schedule for a day from the user's instructions.", parameters: S("object", "", { properties: {
      date: S("string", "YYYY-MM-DD."), blocks: S("array", "Blocks in time order.", { items: BLOCK }),
    }, required: ["date", "blocks"] }) },
    { name: "editDayPlan", description: "Change the existing HV Reset plan in context.today_plan. Return the FULL new block list; keep block_id on blocks you keep.", parameters: S("object", "", { properties: {
      date: S("string", "YYYY-MM-DD."), blocks: S("array", "The full new list of blocks.", { items: BLOCK }),
    }, required: ["date", "blocks"] }) },
    { name: "deleteTasks", description: "Delete one or more tasks from ONE day of the HV Reset plan (the user said delete/remove/hata do/cancel). Find them in context.upcoming_plans (each task has a block_id). The user sees exactly what will be deleted and confirms first.", parameters: S("object", "", { properties: {
      date: S("string", "YYYY-MM-DD of the day."), block_ids: S("array", "block_id of each task to delete.", { items: S("string", "A block_id.") }),
      titles: S("array", "Task titles as the user said them, if you don't have block_ids.", { items: S("string", "A title.") }),
    }, required: ["date"] }) },
    { name: "clearPlans", description: "Empty whole days of the HV Reset plan: one date, several dates, a range, or all upcoming days (today onward). The user sees every day and task that will go and confirms first. Never build an empty plan instead.", parameters: S("object", "", { properties: {
      dates: S("array", "Specific days YYYY-MM-DD.", { items: S("string", "A date.") }), from: S("string", "Range start YYYY-MM-DD."), to: S("string", "Range end YYYY-MM-DD."),
      all_upcoming: S("boolean", "true for 'all upcoming days / aage ke sab dates' (today onward)."),
      include_daily_plan: S("boolean", "true only if the user also wants their every-day plan deleted (it fills every day that has no plan of its own)."),
    } }) },
    { name: "answer", description: "Reply to the user in their language (Hinglish/Hindi/English), short. For questions, answer ONLY from context.stats and context lists. When you also propose actions, say what you are proposing, never that it is done.", parameters: S("object", "", { properties: {
      text: S("string", "The reply."),
    }, required: ["text"] }) },
    { name: "askClarification", description: "Ask one short question when the request is unclear or a name matches more than one job.", parameters: S("object", "", { properties: {
      question: S("string", "The question."), options: S("array", "Up to 5 short choices.", { items: S("string", "A choice.") }),
    }, required: ["question"] }) },
  ];
  const SYSTEM = [
    "You are HV AI, the assistant inside HV Vault (job-hunt CRM) and HV Reset (daily plan). You help the person using the app.",
    "Reply in the language the user used (Hinglish, Hindi or English). Keep replies very short.",
    "You can only act through the provided functions. Always call at least one function. Always include one 'answer' call with a short reply, unless you call askClarification.",
    "History lines starting with [CANCELLED by the user: ...] mean the user rejected that proposal. Never repeat its blocks, times or details. Build every new proposal only from the user's latest message plus the current data in context (for day plans: context.today_plan, the confirmed plan).",
    "Your calls are proposals: the app shows them to the user to confirm. Never say something is done or updated ('kar diya', 'ho gaya', 'done', 'updated' are wrong); say what will happen after they confirm, e.g. 'Ye raha naya plan, confirm karo.'",
    "Use ids from the context when a job/follow-up clearly matches. If a company or role matches more than one job and the user did not say which, call askClarification listing them. If nothing matches, say so in 'answer' and do not invent ids.",
    "Dates: use context.now (India time) and context.date_hints for kal, parso, weekdays and 'next <day>'. '4 baje' means 16:00 unless morning is said; '10 baje' means 10:00. In function arguments output dates as YYYY-MM-DD and times as HH:MM (24-hour). In any text the user reads (answer, askClarification) always write times in 12-hour format with AM/PM, e.g. 5:25 PM, never 17:25.",
    "Never invent a date or time. If the user wants an event (interview, call, deadline) but did not say when, call askClarification asking the date and time, and do not call addEvent. 'Is hafte' / 'this week' means applied_this_week (weeks start Monday); 'pichle 7 din' / 'last 7 days' means applied_last_7_days.",
    "'Applied mark karo' = moveStage to Applied (this auto-creates a follow-up). If the user also gives a follow-up time, add addFollowUp with in_days or due_date too.",
    "Questions like 'aaj kitne apply kiye' or 'pending follow-ups': answer from context.stats and context.followups_pending only; never guess numbers.",
    "Deleting in HV Reset: to remove tasks use deleteTasks (one day); to empty whole days use clearPlans. Never send buildDayPlan or editDayPlan with no blocks. Nothing is deleted until the user confirms the card, so never say it is already deleted or cleared.",
    "Think before you act. If something is unclear or looks like a mistake (the same task twice, a time that could be AM or PM, a date that doesn't fit, a missing time for a timed task), ask ONE short question with answer instead of guessing. Never invent a date: use context.now for today, tomorrow and weekdays.",
    "If context.pending_question is present, you asked the user that question about the plan in context.pending_question.plan, and their message is most likely the answer: return that whole plan again (same date) with their answer applied, as buildDayPlan (or editDayPlan when changing today's plan).",
    "Day plans (HV Reset): plan only what the user asked for. If they name one or two tasks ('kal 8 baje study'), the plan has just those blocks: do not add breaks, meals or other tasks they did not ask for. Use the length they give; if none, 60 minutes. For a whole day ('poora din plan karo', a list of several tasks), follow these rules too: one block = one task. Start from context.now rounded up to the next 15 minutes unless a start is given. Keep work blocks at most 90 minutes with short breaks (kind rest) between them. Never skip a meal: include lunch around 13:30 and dinner around 20:30 when the plan covers those times. 'Free after 7' / 'shaam 7 ke baad free' means no work blocks after 19:00 (add a free block from 19:00; leftover time before that can stay free). Times the user gives are fixed: '2 se 3 outreach' means outreach exactly 14:00-15:00; never move a block the user timed, fit breaks and meals around it. Mark applying, interview prep and outreach as core. When editing today_plan: core blocks may shrink but never be removed, and meal blocks stay.",
    "Shifting the plan ('sab 7:30 PM se shuru karo', 'late ho gaya, baaki sab shift karo', 'push everything by 1 hour'): call editDayPlan with EVERY block of today_plan that is not done, in the same order, back to back from the new start (default: context.now rounded up to the next 15 minutes), keeping each block_id, title, kind and duration_min. Leave done blocks as they are. If it runs past midnight just keep counting (24:15, 24:45); the app fits it into the day.",
  ].join("\n");

  /* ---------------- one assistant per app ----------------
     Each app's HV AI only changes its own app. Shared data (applied counts, follow-ups due) still
     syncs to both apps through the normal link; the assistant just can't reach across. */
  const APPS = {
    vault: { name: "HV Vault", actions: ["addJob", "updateJob", "moveStage", "deleteJob", "addFollowUp", "completeFollowUp", "addEvent", "answer", "askClarification"],
      rule: "This chat is inside HV Vault. Here you may only change HV Vault: jobs, follow-ups and calendar events. You cannot make or change day plans here: if asked, call only 'answer' saying that day plans are made in HV Reset (open HV Reset and ask HV AI there)." },
    reset: { name: "HV Reset", actions: ["buildDayPlan", "editDayPlan", "deleteTasks", "clearPlans", "answer", "askClarification"],
      rule: "This chat is inside HV Reset. Here you may only make or change the day plan. You cannot add, change, move or delete jobs, follow-ups or calendar events here: if asked, call only 'answer' saying that this is done in HV Vault (open HV Vault and ask HV AI there). You may still answer questions about jobs and follow-ups from the context." },
  };
  const scopeOf = (app) => {
    const a = APPS[app];
    if (!a) return { tools: TOOLS, system: SYSTEM, allowed: ACTIONS };
    return { tools: TOOLS.filter((t) => a.actions.indexOf(t.name) >= 0), system: SYSTEM + "\n" + a.rule, allowed: a.actions, name: a.name };
  };
  const otherApp = (app, type) => { const o = Object.keys(APPS).find((k) => k !== app && APPS[k].actions.indexOf(type) >= 0); return o ? APPS[o].name : ""; };

  /* ---------------- provider calls ---------------- */
  const upperType = (s) => { if (!s || typeof s !== "object") return s; const o = Array.isArray(s) ? s.map(upperType) : {}; if (!Array.isArray(s)) for (const k in s) o[k] = k === "type" && typeof s[k] === "string" ? s[k].toUpperCase() : upperType(s[k]); return o; };   // only schema "type" strings; a property may itself be named "type"
  const DEFAULT_GEMINI = "gemini-3.1-flash-lite", FALLBACK_GEMINI = "gemini-3.5-flash", DEFAULT_OR = "google/gemini-3.1-flash-lite";
  async function post(url, body, headers, ms) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms || 45000);
    try {
      const r = await fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body), signal: ctrl.signal });
      let j = {}; try { j = await r.json(); } catch (e) {}
      return { status: r.status, ok: r.ok && !j.error, json: j };
    } catch (e) { return { status: 0, ok: false, json: { error: { message: e && e.name === "AbortError" ? "timed out" : "network error" } } }; }
    finally { clearTimeout(t); }
  }
  /* The site's built-in AI (HVCloud.gemini: Firebase AI Logic + App Check) needs no key; on the website it is
     the only AI. A personal key is used only where there is no built-in AI (the desktop app). */
  const builtInAI = () => !!(typeof window !== "undefined" && window.HVCloud && window.HVCloud.aiOn);
  const pickConfig = (st) => (builtInAI() ? { provider: "builtin" } : { provider: st && st.aiProvider, key: st && st.aiKey, model: st && st.aiModel });
  const hasAI = (c) => !!(c && (c.provider === "builtin" || (c.key && c.provider && c.provider !== "off")));
  async function callGemini(cfg, model, body, ms) {
    if (cfg.provider === "builtin") {
      const models = model ? [model, model === FALLBACK_GEMINI ? DEFAULT_GEMINI : FALLBACK_GEMINI] : undefined;   // the other model has its own per-minute limit
      const r = await window.HVCloud.gemini(body, { models, timeout: ms || 45000, onWait: cfg.onWait });
      return { ok: r.ok, status: r.status, json: r.json || {}, builtinError: r.ok ? "" : r.error };
    }
    return post("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model || DEFAULT_GEMINI) + ":generateContent?key=" + encodeURIComponent(cfg.key), body, null, ms);
  }
  const friendlyErr = (r) => {
    if (r.builtinError) return r.builtinError;
    const m = (r.json && r.json.error && (r.json.error.message || r.json.error)) || "";
    if (r.status === 400 && /api key/i.test(m)) return "Your AI key was rejected. Check it in HV Vault > Settings > HV AI.";
    if (r.status === 401 || r.status === 403) return "Your AI key isn't allowed (" + (m || r.status) + "). Check it in HV Vault > Settings > HV AI.";
    if (r.status === 429) return "The AI is rate-limited right now. Try again in a minute.";
    if (r.status === 404) return "That AI model isn't available. Clear the Model field in HV Vault > Settings > HV AI > Advanced.";
    if (!r.status) return "Couldn't reach the AI (" + m + "). Check your internet.";
    return "AI error: " + (m || "HTTP " + r.status);
  };
  async function geminiActions(cfg, userText, context, history, model, scope) {
    const contents = (history || []).slice(-8).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));
    contents.push({ role: "user", parts: [{ text: "CONTEXT (JSON):\n" + JSON.stringify(context) + "\n\nUSER SAYS:\n" + userText }] });
    const r = await callGemini(cfg, model, {
      systemInstruction: { parts: [{ text: scope.system }] }, contents,
      tools: [{ functionDeclarations: scope.tools.map((t) => ({ name: t.name, description: t.description, parameters: upperType(t.parameters) })) }],
      toolConfig: { functionCallingConfig: { mode: "ANY" } }, generationConfig: { temperature: 0.1 },
    });
    if (!r.ok && r.status === 400 && cfg.provider === "builtin") return jsonActions(cfg, contents, model, scope);   // function calling refused: same request as strict JSON
    if (!r.ok) return { error: friendlyErr(r), status: r.status };
    const parts = (r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content && r.json.candidates[0].content.parts) || [];
    const calls = parts.filter((p) => p.functionCall).map((p) => ({ type: p.functionCall.name, args: p.functionCall.args || {} }));
    const text = parts.map((p) => p.text || "").join("").trim();
    if (!calls.length && text) calls.push({ type: "answer", args: { text } });
    return { actions: calls };
  }
  /* strict-JSON mode: the functions are described in the prompt and the reply is {"actions":[{type,args}]} */
  async function jsonActions(cfg, contents, model, scope) {
    const spec = scope.tools.map((t) => "- " + t.name + ": " + t.description + " args: " + JSON.stringify(t.parameters.properties || {})).join("\n");
    const r = await callGemini(cfg, model, {
      systemInstruction: { parts: [{ text: scope.system + "\nReply with ONLY a JSON object {\"actions\":[{\"type\":<function name>,\"args\":{...}}]} using only these functions:\n" + spec }] },
      contents, generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    });
    if (!r.ok) return { error: friendlyErr(r), status: r.status };
    const text = ((r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content && r.json.candidates[0].content.parts) || []).map((p) => p.text || "").join("");
    const calls = [];
    try { const j = JSON.parse(text.replace(/```json|```/g, "").trim()); (j.actions || []).forEach((x) => x && x.type && calls.push({ type: x.type, args: x.args || {} })); }
    catch (e) { if (text.trim()) calls.push({ type: "answer", args: { text: text.trim().slice(0, 600) } }); }
    return { actions: calls };
  }
  async function openrouterActions(cfg, userText, context, history, model, scope) {
    const messages = [{ role: "system", content: scope.system }].concat((history || []).slice(-8).map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text })));
    messages.push({ role: "user", content: "CONTEXT (JSON):\n" + JSON.stringify(context) + "\n\nUSER SAYS:\n" + userText });
    const r = await post("https://openrouter.ai/api/v1/chat/completions", {
      model, messages, temperature: 0.1, tool_choice: "required",
      tools: scope.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }, { Authorization: "Bearer " + cfg.key });
    if (!r.ok) return { error: friendlyErr(r), status: r.status };
    const msg = (r.json.choices && r.json.choices[0] && r.json.choices[0].message) || {};
    const calls = (msg.tool_calls || []).map((c) => { let a = {}; try { a = JSON.parse(c.function.arguments || "{}"); } catch (e) {} return { type: c.function.name, args: a }; });
    if (!calls.length && msg.content) {                                  // strict-JSON fallback for models without tools
      try { const j = JSON.parse(String(msg.content).replace(/```json|```/g, "")); (j.actions || []).forEach((x) => calls.push({ type: x.type, args: x.args || x })); }
      catch (e) { calls.push({ type: "answer", args: { text: String(msg.content).slice(0, 600) } }); }
    }
    return { actions: calls };
  }
  /* Words that say when something happens. If a message has none, an event can't have a real date:
     the model guessed it, so HV AI asks instead (never guesses). */
  const WHEN_RE = /\b(aaj|aj|today|tonight|kal|tomorrow|parso|parson|narso|day after|next|agle|agli|is|this|coming|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar|jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|subah|dopahar|shaam|sham|raat|morning|afternoon|evening|night|noon|baje|am|pm|\d+\s*(din|days?|hafte|weeks?))\b|\d{1,2}[:.]\d{2}|\d{1,2}\s*(am|pm)|\d{1,2}[\/-]\d{1,2}|\d{4}-\d{2}-\d{2}|आज|कल|परसों|बजे|सुबह|शाम|रात/i;
  /* "10 se 12 apply", "2 se 3 outreach", "4-5 pm prep": the user fixed these times, so a plan block of
     that kind is put exactly there even if the model packed it elsewhere. */
  const LABEL_KIND = [[/apply|application|apps?\b|job/, "apply"], [/outreach|network|message|msg|dm\b|linkedin|connect/, "outreach"], [/prep|interview|practi[cs]e|mock/, "prep"], [/lunch|dinner|khana|breakfast|nashta/, "meal"], [/free|chill|rest|break/, "free"]];
  function userRanges(text) {
    const t = String(text || "").toLowerCase(), out = [];
    const re = /(subah|morning|dopahar|afternoon|shaam|sham|evening|raat|night)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:se|to|till|-|–)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:baje)?\s*(?:tak)?\s*([^\d,.;]{0,30})/g;
    let m;
    while ((m = re.exec(t))) {
      const part = m[1] || "", tail = m[8] || "";
      const to24 = (h, ap) => {
        h = +h; if (h > 23) return NaN;
        if (ap === "pm" || /shaam|sham|evening|raat|night/.test(part)) return h < 12 ? h + 12 : h;
        if (ap === "am" || /subah|morning/.test(part)) return h === 12 ? 0 : h;
        if (/dopahar|afternoon/.test(part)) return h < 12 && h <= 5 ? h + 12 : h;
        return h >= 1 && h <= 7 ? h + 12 : h;                      // "2 se 3" in a day plan means the afternoon
      };
      const a = to24(m[2], m[4] || m[7]) * 60 + (+m[3] || 0);
      let b = to24(m[5], m[7] || m[4]) * 60 + (+m[6] || 0);
      if (b <= a && b + 720 > a) b += 720;                            // "subah 10 se 12": the 12 is noon
      const lk = LABEL_KIND.find(([rx]) => rx.test(tail));
      if (isFinite(a) && isFinite(b) && b > a && lk) out.push({ start: a, end: b, kind: lk[1] });
    }
    return out;
  }
  function anchorTimes(actions, userText) {
    const ranges = userRanges(userText);
    if (!ranges.length) return actions;
    return actions.map((a) => {
      if (!a || (a.type !== "buildDayPlan" && a.type !== "editDayPlan") || !a.args || !Array.isArray(a.args.blocks)) return a;
      const blocks = a.args.blocks.map((b) => Object.assign({}, b));
      ranges.forEach((r) => {
        const same = blocks.filter((b) => b && (b.kind === r.kind || (r.kind === "meal" && /lunch|dinner/i.test(b.title || ""))));
        if (!same.length || same.some((b) => Math.abs(toMin(b.start) - r.start) <= 20)) return;   // already where the user said
        const b = same[0];
        b.start = pad(Math.floor(r.start / 60)) + ":" + pad(r.start % 60);
        if (same.length === 1) b.duration_min = Math.min(Number(b.duration_min) || (r.end - r.start), r.end - r.start);
      });
      return Object.assign({}, a, { args: Object.assign({}, a.args, { blocks }) });
    });
  }
  function guard(actions0, userText) {
    const actions = Array.isArray(actions0) ? anchorTimes(actions0, userText) : actions0;
    if (!Array.isArray(actions) || WHEN_RE.test(String(userText || ""))) return actions;
    let asked = actions.some((a) => a && a.type === "askClarification");
    const out = [];
    actions.forEach((a) => {
      if (a && a.type === "addEvent") {
        if (!asked) out.push({ type: "askClarification", args: { question: "Kab hai? Date aur time batao (jaise: kal 4 baje)." } });
        asked = true;
      } else if (!(a && a.type === "answer" && asked)) out.push(a);
    });
    return out;
  }
  async function interpret(cfg, userText, context, history, app) {
    if (!hasAI(cfg)) return { error: "NO_KEY" };
    const scope = scopeOf(app);
    if (cfg.provider === "openrouter") { const o = await openrouterActions(cfg, userText, context, history, cfg.model || DEFAULT_OR, scope); return o && o.actions ? Object.assign({}, o, { actions: guard(o.actions.map(normalize), userText) }) : o; }
    const model = cfg.model || DEFAULT_GEMINI;
    const tidy = (x) => (x && x.actions ? Object.assign({}, x, { actions: guard(x.actions.map(normalize), userText) }) : x);
    let r = tidy(await geminiActions(cfg, userText, context, history, model, scope));
    const usable = r.actions && r.actions.some((a) => validate(a).ok);
    if (!cfg.model && (r.error || !usable) && [400, 401, 403, 429, 503].indexOf(r.status) < 0) {   // retry once on the stronger model (busy is already retried inside)
      const r2 = tidy(await geminiActions(cfg, userText, context, history, FALLBACK_GEMINI, scope));
      if (r2.actions && r2.actions.some((a) => validate(a).ok)) r = r2;
    }
    return r;
  }
  async function transcribe(cfg, wavB64) {
    const r = await callGemini(cfg, cfg.provider === "builtin" ? null : cfg.model || DEFAULT_GEMINI, {
      contents: [{ role: "user", parts: [
        { text: "Transcribe this voice note exactly as spoken. It may be Hindi, English or Hinglish. Write Hindi words in Latin script (Hinglish), keep English words in English, keep names, numbers and links. Output only the transcript." },
        { inlineData: { mimeType: "audio/wav", data: wavB64 } }] }],
      generationConfig: { temperature: 0 },
    }, 60000);
    if (!r.ok) return { error: friendlyErr(r) };
    const parts = (r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content && r.json.candidates[0].content.parts) || [];
    return { text: parts.map((p) => p.text || "").join("").trim() };
  }

  /* ---------------- validation ---------------- */
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s + "T12:00:00Z"));
  const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s || "") && toMin(s) < 1440;
  const isBlockTime = (s) => /^\d{1,2}:\d{2}$/.test(s || "") && toMin(s) < 2880;   // a plan may run past midnight ("24:30"); fixPlan fits it into the day
  /* read the time formats models actually send: "19:30", "7:30 PM", "7.30pm", "19:30:00", "1930", "7 pm", "24:15" */
  function normTime(v) {
    if (typeof v === "number" && isFinite(v)) v = String(v);
    const t = String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ");
    let m = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([ap])\.?\s*m?\.?$/.exec(t);
    if (m) { let h = +m[1] % 12; if (m[3] === "p") h += 12; return pad(h) + ":" + (m[2] || "00"); }
    m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(t); if (m) return pad(+m[1]) + ":" + m[2];
    m = /^(\d{1,2})(\d{2})$/.exec(t); if (m && +m[2] < 60) return pad(+m[1]) + ":" + m[2];
    return v;
  }
  const KIND_ALIAS = { break: "rest", breather: "rest", lunch: "meal", dinner: "meal", breakfast: "meal", food: "meal", task: "work", deep_work: "work", applying: "apply", application: "apply", applications: "apply", interview: "prep", interview_prep: "prep", networking: "outreach", end: "close", wrap: "close" };
  /* tidy one model action before validation (times, numbers, kind names); never invents content */
  function normalize(action) {
    if (!action || !action.args || typeof action.args !== "object") return action;
    const a = Object.assign({}, action.args);
    if (a.time != null && a.time !== "") a.time = normTime(a.time);
    if (Array.isArray(a.blocks)) {
      let prev = -1;
      a.blocks = a.blocks.map((b) => {
        if (!b || typeof b !== "object") return b;
        const x = Object.assign({}, b);
        x.start = normTime(x.start);
        let m = toMin(x.start);
        if (!isNaN(m) && prev >= 0 && m < prev - 360) { m += 1440; x.start = pad(Math.floor(m / 60)) + ":" + pad(m % 60); }   // "00:15" after "23:30" = past midnight
        if (!isNaN(m)) prev = m;
        if (typeof x.duration_min === "string" && /^\d+$/.test(x.duration_min.trim())) x.duration_min = +x.duration_min.trim();
        if (typeof x.duration_min === "number") x.duration_min = Math.round(x.duration_min);
        if (typeof x.kind === "string") { const k = x.kind.trim().toLowerCase().replace(/[\s-]+/g, "_"); x.kind = BLOCK_KINDS.indexOf(k) >= 0 ? k : (KIND_ALIAS[k] || x.kind); }
        return x;
      });
    }
    return Object.assign({}, action, { args: a });
  }
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  const hasRef = (a) => str(a.job_id) || str(a.company) || str(a.role);
  function validate(action) {
    const errs = [];
    if (!action || ACTIONS.indexOf(action.type) < 0) return { ok: false, errors: ["unknown action " + (action && action.type)] };
    const a = action.args || {};
    const tool = TOOLS.find((t) => t.name === action.type), props = tool.parameters.properties;
    Object.keys(a).forEach((k) => {
      if (!props[k]) { errs.push("unexpected field " + k); return; }
      const p = props[k], v = a[k];
      if (v === null || v === undefined || v === "") return;
      if (p.type === "string" && typeof v !== "string") errs.push(k + " must be text");
      if (p.type === "integer" && !(Number.isInteger(v) || (typeof v === "string" && /^\d+$/.test(v)))) errs.push(k + " must be a whole number");
      if (p.type === "boolean" && typeof v !== "boolean") errs.push(k + " must be true/false");
      if (p.type === "array" && !Array.isArray(v)) errs.push(k + " must be a list");
      if (p.enum && p.enum.indexOf(v) < 0) errs.push(k + " must be one of " + p.enum.join(", "));
    });
    (tool.parameters.required || []).forEach((k) => { if (a[k] === undefined || a[k] === null || a[k] === "" || (Array.isArray(a[k]) && !a[k].length)) errs.push("missing " + k); });
    const t = action.type;
    if (["updateJob", "moveStage", "deleteJob"].indexOf(t) >= 0 && !hasRef(a)) errs.push("which job?");
    if (t === "addFollowUp" && !hasRef(a)) errs.push("which job?");
    if (t === "addFollowUp" && !(isDate(a.due_date) || (Number(a.in_days) >= 0 && Number(a.in_days) <= 365 && a.in_days !== undefined && a.in_days !== ""))) errs.push("follow-up needs a date or number of days");
    if (t === "deleteTasks" && !((Array.isArray(a.block_ids) && a.block_ids.length) || (Array.isArray(a.titles) && a.titles.length))) errs.push("which tasks?");
    if (t === "clearPlans" && !(a.all_upcoming === true || (Array.isArray(a.dates) && a.dates.length) || a.from)) errs.push("which days?");
    ["from", "to"].forEach((k) => { if (a[k] && !isDate(a[k])) errs.push(k + " must be YYYY-MM-DD"); });
    if (Array.isArray(a.dates)) a.dates.forEach((d) => { if (!isDate(d)) errs.push("dates must be YYYY-MM-DD"); });
    if (t === "completeFollowUp" && !str(a.followup_id) && !str(a.company) && !str(a.title)) errs.push("which follow-up?");
    ["due_date", "deadline", "date"].forEach((k) => { if (a[k] && !isDate(a[k])) errs.push(k + " must be YYYY-MM-DD"); });
    if (a.time && !isTime(a.time)) errs.push("time must be HH:MM");
    if (a.link && !/^(https?:\/\/)?[^\s]+\.[^\s]+$/i.test(a.link)) errs.push("link doesn't look like a URL");
    if (t === "buildDayPlan" || t === "editDayPlan") (Array.isArray(a.blocks) ? a.blocks : []).forEach((b, i) => {
      if (!b || typeof b !== "object") { errs.push("block " + (i + 1) + " is empty"); return; }
      if (!isBlockTime(b.start)) errs.push("block " + (i + 1) + " has a time I couldn't read (" + (b.start || "empty") + ")");
      const dm = Number(b.duration_min); if (!(dm >= 5 && dm <= 600)) errs.push("block " + (i + 1) + " length must be 5-600 minutes");
      if (!str(b.title)) errs.push("block " + (i + 1) + " needs a title");
      if (BLOCK_KINDS.indexOf(b.kind) < 0) errs.push("block " + (i + 1) + " kind must be one of " + BLOCK_KINDS.join(", "));
    });
    return { ok: !errs.length, errors: errs };
  }

  /* ---------------- resolving references ---------------- */
  const companyName = (data, id) => (((data && data.companies) || []).find((c) => c.id === id) || {}).name || "";
  const jobLabel = (data, j) => (j ? (j.title || "Role") + " at " + (companyName(data, j.company_id) || "unknown company") + " (" + j.status + ")" : "");
  function findJobs(data, ref) {
    const jobs = (data && data.jobs) || [];
    const c = norm(ref.company), r = norm(ref.role);
    if (str(ref.job_id)) {                                               // trust an id only if it agrees with the name the user said
      const j = jobs.find((x) => x.id === ref.job_id), n = j && norm(companyName(data, j.company_id));
      if (j && (!c || (n && (n.indexOf(c) >= 0 || c.indexOf(n) >= 0)))) return [j];
    }
    if (!c && !r) return [];
    let cand = jobs;
    if (c) cand = cand.filter((j) => { const n = norm(companyName(data, j.company_id)); return n && (n.indexOf(c) >= 0 || c.indexOf(n) >= 0); });
    if (r) {
      const words = r.split(" ").filter((w) => w.length > 1);
      const byRole = cand.filter((j) => { const t = norm(j.title); return t.indexOf(r) >= 0 || r.indexOf(t) >= 0 || (words.length && words.filter((w) => t.indexOf(w) >= 0).length / words.length >= 0.6); });
      if (byRole.length || !c) cand = byRole;
    }
    return cand;
  }
  function findFollowups(data, a) {
    const fus = ((data && data.followups) || []).filter((f) => f.status === "Pending");
    if (str(a.followup_id)) { const f = fus.find((x) => x.id === a.followup_id); if (f) return [f]; }
    let cand = fus;
    if (str(a.company)) { const c = norm(a.company); cand = cand.filter((f) => { const n = norm(companyName(data, f.company_id)); return n && (n.indexOf(c) >= 0 || c.indexOf(n) >= 0); }); }
    if (str(a.title)) { const t = norm(a.title); const m = cand.filter((f) => norm(f.title).indexOf(t) >= 0); if (m.length) cand = m; }
    if (str(a.job_id)) { const m = cand.filter((f) => f.job_id === a.job_id); if (m.length) cand = m; }
    return str(a.company) || str(a.title) || str(a.job_id) ? cand : [];
  }
  /* -> { status: ready | choose | notfound | invalid | info, action (with ids filled), options?, message? } */
  function resolve(action, data, ctx) {
    const v = validate(action);
    if (!v.ok) return { status: "invalid", action, message: v.errors.join("; ") };
    const a = Object.assign({}, action.args), t = action.type, today = (ctx && ctx.today) || istNow().date;
    if (t === "answer" || t === "askClarification") return { status: "info", action: { type: t, args: a } };
    const needsJob = ["updateJob", "moveStage", "deleteJob"].indexOf(t) >= 0 || ((t === "addFollowUp" || t === "addEvent") && hasRef(a));
    if (needsJob) {
      const m = findJobs(data, a);
      if (!m.length && (t === "addEvent")) { delete a.job_id; }
      else if (!m.length) return { status: "notfound", action: { type: t, args: a }, message: "No job matches " + [a.company, a.role].filter(Boolean).join(" · ") + "." };
      else if (m.length > 1) return { status: "choose", action: { type: t, args: a }, options: m.slice(0, 6).map((j) => ({ id: j.id, label: jobLabel(data, j) })), message: "Which job?" };
      else a.job_id = m[0].id;
    }
    if (t === "completeFollowUp") {
      const m = findFollowups(data, a);
      if (!m.length) return { status: "notfound", action: { type: t, args: a }, message: "No pending follow-up matches." };
      if (m.length > 1) return { status: "choose", action: { type: t, args: a }, options: m.slice(0, 6).map((f) => ({ id: f.id, label: (f.title || "Follow-up") + " · " + (companyName(data, f.company_id) || "") + (f.due_date ? " · due " + niceDate(f.due_date) : "") })), message: "Which follow-up?", field: "followup_id" };
      a.followup_id = m[0].id;
    }
    if (t === "addFollowUp" && !isDate(a.due_date)) a.due_date = addDays(today, Number(a.in_days));
    if (t === "addJob" && !a.stage) a.stage = "Saved";
    if (t === "addEvent" && !a.type) a.type = /interview/i.test(a.title || "") ? "interview" : "custom";
    return { status: "ready", action: { type: t, args: a } };
  }
  function choose(res, id) {
    const a = Object.assign({}, res.action.args); a[res.field || "job_id"] = id;
    return { status: "ready", action: { type: res.action.type, args: a } };
  }

  /* ---------------- HV Reset plan rules ---------------- */
  const MEALS = [{ name: "Lunch", from: 12 * 60 + 30, to: 15 * 60, at: 13 * 60 + 30, len: 30 }, { name: "Dinner", from: 19 * 60 + 30, to: 22 * 60, at: 20 * 60 + 30, len: 30 }];
  const JOIN = /\s+(?:and|aur|&|\+|then|phir)\s+/i;
  /* one block one task; core blocks shrink but never drop; never skip a meal. Returns { blocks, notes } */
  /* a shifted or late plan must still end by midnight: drop free time and breaks, then shrink
     (core never below 15 min, meals never below 20), then drop optional work. Finished blocks never move. */
  function fitDay(blocks, notes) {
    const END = 1440, live = () => blocks.filter((b) => !b.locked);
    const endOf = () => blocks.reduce((m, b) => Math.max(m, b.start + b.duration_min), 0);
    if (!blocks.length || endOf() <= END) return;
    const before = endOf();
    const pack = () => { const l = live(); if (!l.length) return; let t = l[0].start; l.forEach((b) => { b.start = t; t += b.duration_min; }); };
    const dropped = [];
    for (let i = blocks.length - 1; i >= 0 && endOf() > END; i--) if (!blocks[i].locked && (blocks[i].kind === "free" || blocks[i].kind === "rest")) dropped.push(blocks.splice(i, 1)[0].title);
    pack();
    let need = endOf() - END;
    if (need > 0) {
      const floor = (b) => (b.core ? 15 : b.kind === "meal" ? 20 : 10);
      const l = live(), slack = l.reduce((s, b) => s + Math.max(0, b.duration_min - floor(b)), 0);
      if (slack > 0) {
        const ratio = Math.min(1, need / slack);
        l.forEach((b) => { const room = Math.max(0, b.duration_min - floor(b)); b.duration_min -= Math.min(room, 5 * Math.ceil(room * ratio / 5)); });   // cut in 5-minute steps
        pack(); need = endOf() - END;
      }
      for (let i = blocks.length - 1; i >= 0 && need > 0; i--) if (!blocks[i].locked && !blocks[i].core && blocks[i].kind !== "meal") { dropped.push(blocks.splice(i, 1)[0].title); pack(); need = endOf() - END; }
      if (need > 0) { const last = live().pop(); if (last) last.duration_min = Math.max(5, END - last.start); }
    }
    notes.push("Fitted the day before midnight (it ran " + Math.round(before - END) + " min over): " + (dropped.length ? "removed " + dropped.join(", ") + "; " : "") + "shortened blocks where needed. Core tasks kept, meals kept.");
  }
  function fixPlan(blocksIn, current, opts) {
    opts = opts || {};
    const notes = [], addedMeals = [];
    let blocks = [];
    (blocksIn || []).forEach((b) => {
      const base = { block_id: b.block_id, start: toMin(b.start), duration_min: Math.round(Number(b.duration_min)), title: String(b.title).trim(), kind: b.kind, core: typeof b.core === "boolean" ? b.core : ["apply", "prep", "outreach"].indexOf(b.kind) >= 0 };   // an explicit choice wins
      const parts = base.kind === "free" || base.kind === "meal" || base.kind === "rest" ? [base.title] : base.title.split(JOIN).map((x) => x.trim()).filter(Boolean);
      if (parts.length > 1) {
        const each = Math.max(10, Math.round(base.duration_min / parts.length));
        parts.forEach((p, i) => blocks.push(Object.assign({}, base, { block_id: i ? undefined : base.block_id, title: p[0].toUpperCase() + p.slice(1), start: base.start + i * each, duration_min: each })));
        notes.push("Split '" + base.title + "' into " + parts.length + " blocks (one block, one task).");
      } else blocks.push(base);
    });
    const MAXB = 90, cut = [];                                           // HV Reset rule: work blocks are 90 min at most, with a short break between
    blocks.forEach((b) => {
      if (["free", "meal", "rest", "close"].indexOf(b.kind) >= 0 || !(b.duration_min > MAXB)) { cut.push(b); return; }
      const n = Math.ceil(b.duration_min / MAXB), each = Math.round(b.duration_min / n / 5) * 5 || MAXB;
      let t = b.start;
      for (let i = 0; i < n; i++) {
        const len = i === n - 1 ? b.duration_min - each * (n - 1) : each;
        cut.push(Object.assign({}, b, { block_id: i ? undefined : b.block_id, start: t, duration_min: len })); t += len;
        if (i < n - 1) { cut.push({ start: t, duration_min: 15, title: "Break", kind: "rest", core: false }); t += 15; }
      }
      notes.push("Split '" + b.title + "' (" + b.duration_min + " min) into " + n + " blocks with short breaks (90 min max per block).");
    });
    blocks = cut;
    blocks.sort((a, b) => a.start - b.start);
    if (current && current.length) {                                     // finished blocks stay exactly where they were
      current.filter((c) => c.done).forEach((c) => {
        blocks = blocks.filter((b) => !((b.block_id && b.block_id === c.id) || norm(b.title) === norm(c.title)));
        blocks.push({ block_id: c.id, start: toMin(c.start), duration_min: c.duration_min, title: c.title, kind: BLOCK_KINDS.indexOf(c.kind) >= 0 ? c.kind : "work", core: !!c.core, locked: true });
      });
      blocks.sort((a, b) => a.start - b.start);
    }
    if (current && current.length) {                                     // editing: keep core work and meals
      current.forEach((c) => {
        if (c.done) return;
        const kept = blocks.find((b) => (b.block_id && b.block_id === c.id) || norm(b.title) === norm(c.title));
        if (c.core && !kept) {
          const len = Math.max(15, Math.round((c.duration_min || 30) / 2));
          const lastWork = blocks.filter((b) => b.kind !== "free").pop();
          const at = lastWork ? lastWork.start + lastWork.duration_min : toMin(c.start);
          blocks.push({ block_id: c.id, start: at, duration_min: len, title: c.title, kind: BLOCK_KINDS.indexOf(c.kind) >= 0 && c.kind !== "meal" ? c.kind : "work", core: true });
          notes.push("Kept core block '" + c.title + "' (" + len + " min): core tasks can shrink, never drop.");
        } else if (c.core && kept && kept.duration_min < 10) { kept.duration_min = 10; notes.push("'" + c.title + "' kept at 10 min minimum."); }
        if (c.kind === "meal" && !kept) { blocks.push({ block_id: c.id, start: toMin(c.start), duration_min: c.duration_min || 30, title: c.title, kind: "meal", core: false }); notes.push("Kept '" + c.title + "': never skip a meal."); }
      });
      blocks.sort((a, b) => a.start - b.start);
    }
    const open = () => blocks.filter((b) => !b.locked);                  // finished blocks don't decide where meals go
    const covers = (w) => { const l = open(); return l.length && l[0].start < w.to && l.reduce((m, b) => Math.max(m, b.start + b.duration_min), 0) > w.from; };
    if (opts.meals !== false) MEALS.forEach((w) => {
      if (!covers(w) || blocks.some((b) => b.kind === "meal" && b.start < w.to && b.start + b.duration_min > w.from)) return;
      const free = open().find((b) => b.kind === "free" && b.start < w.to && b.start + b.duration_min > w.from);
      if (free) {                                                        // put the meal inside free time
        const at = Math.max(free.start, Math.min(w.at, free.start + free.duration_min - w.len));
        const after = free.start + free.duration_min - (at + w.len);
        const pre = at - free.start;
        blocks.splice(blocks.indexOf(free), 1);
        if (pre >= 5) blocks.push(Object.assign({}, free, { duration_min: pre }));
        blocks.push({ start: at, duration_min: w.len, title: w.name, kind: "meal", core: false });
        if (after >= 5) blocks.push(Object.assign({}, free, { block_id: undefined, start: at + w.len, duration_min: after }));
      } else if (!open().some((b) => b.start < w.at + w.len && b.start + b.duration_min > w.at)) {   // the usual meal time is free: eat then
        blocks.push({ start: w.at, duration_min: w.len, title: w.name, kind: "meal", core: false });
      } else {                                                           // insert and push later blocks
        const l = open(), at = l.filter((b) => b.start + b.duration_min <= w.at).reduce((m, b) => Math.max(m, b.start + b.duration_min), l[0].start);
        l.forEach((b) => { if (b.start >= at && b.kind !== "free") b.start += w.len; });   // free time keeps its start
        blocks.push({ start: at, duration_min: w.len, title: w.name, kind: "meal", core: false });
      }
      { const at = blocks.find((b) => b.title === w.name && b.kind === "meal").start; addedMeals.push(w.name + " at " + niceTime(hhmm(at)));
        notes.push("Added " + w.name.toLowerCase() + " at " + niceTime(hhmm(at)) + " (never skip a meal)."); }
      blocks.sort((a, b) => a.start - b.start);
    });
    const l0 = open(), dn = MEALS[1];
    if (opts.meals !== false && l0.length && l0[0].start >= dn.to && l0[0].start < 1440 && !blocks.some((b) => b.kind === "meal" && b.start + b.duration_min > dn.from)) {   // starting after 10 PM with no dinner yet: eat first
      l0.forEach((b) => { b.start += dn.len; });
      blocks.push({ start: l0[0].start - dn.len, duration_min: dn.len, title: dn.name, kind: "meal", core: false });
      addedMeals.push("Dinner at " + niceTime(hhmm(l0[0].start - dn.len)));
      notes.push("Added dinner at " + niceTime(hhmm(l0[0].start - dn.len)) + " first (never skip a meal).");
    }
    blocks.sort((a, b) => a.start - b.start);
    for (let i = 1; i < blocks.length; i++) {                           // no overlaps: work moves later, free time is trimmed
      const prevEnd = blocks[i - 1].start + blocks[i - 1].duration_min;
      if (blocks[i].start >= prevEnd || blocks[i].locked) continue;
      if (blocks[i].kind === "free") { const end = blocks[i].start + blocks[i].duration_min; blocks[i].start = prevEnd; blocks[i].duration_min = Math.max(0, end - prevEnd); }
      else blocks[i].start = prevEnd;
    }
    blocks = blocks.filter((b) => b.duration_min >= 5);
    fitDay(blocks, notes);
    blocks = blocks.filter((b) => b.duration_min >= 5);
    return { blocks: blocks.map((b) => ({ block_id: b.block_id, start: hhmm(b.start), duration_min: b.duration_min, title: b.title, kind: b.kind, core: !!b.core })), notes, addedMeals };
  }

  /* ---------------- plain-language cards ---------------- */
  function describe(action, data) {
    const a = action.args || {}, job = a.job_id && ((data && data.jobs) || []).find((j) => j.id === a.job_id);
    const jl = job ? jobLabel(data, job) : [a.role, a.company].filter(Boolean).join(" at ");
    switch (action.type) {
      case "addJob": return { icon: "+", title: "Add job", text: a.role + " at " + a.company, sub: ["Stage: " + (a.stage || "Saved"), a.source && "Source: " + a.source, a.location && a.location, a.link && "Link: " + a.link].filter(Boolean).join(" · ") };
      case "updateJob": return { icon: "✎", title: "Update job", text: jl, sub: ["new_title", "link", "source", "location", "priority", "deadline", "notes"].filter((k) => a[k]).map((k) => (k === "new_title" ? "Title" : k[0].toUpperCase() + k.slice(1)) + ": " + (k === "deadline" ? niceDate(a[k]) : a[k])).join(" · ") };
      case "moveStage": return { icon: "→", title: "Move stage", text: jl + " → " + a.stage, sub: a.stage === "Applied" ? "Stamps today as applied and sets the first follow-up" : "" };
      case "deleteJob": return { icon: "✕", title: "Delete job", text: jl, sub: "This removes the job from HV Vault", danger: true };
      case "addFollowUp": return { icon: "⏰", title: "Follow-up", text: (a.title || "Follow up") + " · " + jl, sub: "Due " + niceDate(a.due_date) + (a.type ? " · " + a.type : "") };
      case "completeFollowUp": { const f = ((data && data.followups) || []).find((x) => x.id === a.followup_id); return { icon: "✓", title: "Follow-up done", text: f ? (f.title || "Follow-up") + " · " + companyName(data, f.company_id) : (a.title || a.company || "Follow-up"), sub: f && f.due_date ? "Was due " + niceDate(f.due_date) : "" }; }
      case "addEvent": return { icon: "📅", title: EVENT_LABEL[a.type] || "Event", text: a.title, sub: niceDate(a.date) + (a.time ? " · " + niceTime(a.time) : "") + (a.duration_min ? " · " + a.duration_min + " min" : "") + (job ? " · linked to " + jl : "") };
      case "buildDayPlan": case "editDayPlan": return { icon: "🗓", title: action.type === "buildDayPlan" ? "New day plan" : "Change day plan", text: niceDate(a.date) + " · " + (a.blocks || []).length + " blocks", plan: (a.blocks || []).map((b) => niceTime(b.start) + " · " + b.duration_min + " min · " + b.title + (b.core ? " ★" : "")), sub: (a.notes || []).join(" ") };
      case "deleteTasks": { const r = action.resolved || { days: [] }, d = r.days[0] || { date: a.date, tasks: [] };
        return { icon: "✕", title: "Delete " + (d.tasks.length === 1 ? "task" : d.tasks.length + " tasks"), text: niceDate(d.date), plan: d.tasks.map((x) => niceTime(x.start) + " · " + x.title), sub: "Removed from this day's plan. You can undo right after.", danger: true }; }
      case "clearPlans": { const r = action.resolved || { days: [] }, n = r.days.length;
        return { icon: "✕", title: "Clear " + (n === 1 ? "1 day" : n + " days"), text: r.daily ? "All upcoming days, including your daily plan" : r.days.map((x) => niceDate(x.date)).slice(0, 3).join(", ") + (n > 3 ? " and " + (n - 3) + " more" : ""),
          plan: r.days.map((x) => niceDate(x.date) + ": " + (x.tasks.length ? x.tasks.map((t) => t.title).slice(0, 4).join(", ") + (x.tasks.length > 4 ? " +" + (x.tasks.length - 4) : "") : "already empty")),
          sub: (r.daily ? "Your daily plan (used on every day without its own plan) is deleted too. " : "") + "You can undo right after.", danger: true }; }
      default: return { icon: "", title: action.type, text: "" };
    }
  }

  /* ---------------- voice: record WAV (16 kHz mono) for Gemini ---------------- */
  async function toWavB64(blob) {
    const buf = await blob.arrayBuffer();
    const AC = root.AudioContext || root.webkitAudioContext; const ac = new AC();
    const audio = await new Promise((res, rej) => ac.decodeAudioData(buf, res, rej));
    const rate = 16000, len = Math.floor(audio.duration * rate);
    const off = new (root.OfflineAudioContext || root.webkitOfflineAudioContext)(1, len, rate);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0); try { ac.close(); } catch (e) {}
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    const bytes = new Uint8Array(out.buffer); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ---------------- the chat widget ---------------- */
  const CSS = `
.hvai-fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:75;display:flex;align-items:center;gap:9px;padding:6px 18px 6px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.55);
  background:linear-gradient(135deg,#4F66E0 0%,#7C5CE0 100%);color:#fff;font:600 15px/1 'Sora',system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.01em;
  box-shadow:0 14px 34px -12px rgba(64,88,200,.85),inset 0 1px 0 rgba(255,255,255,.3);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .25s cubic-bezier(.22,1,.36,1),opacity .2s}
.hvai-fab svg{width:34px;height:34px;border-radius:11px;display:block}
.hvai-fab:hover{transform:translateY(-1px)}.hvai-fab:active{transform:scale(.97)}
.hvai{--hvai-ink:#16202E;--hvai-muted:rgba(22,32,46,.6);--hvai-bg:rgba(246,248,255,.88);--hvai-card:rgba(255,255,255,.78);--hvai-line:rgba(22,32,46,.1);--hvai-accent:#4058C8;--hvai-grad:linear-gradient(135deg,#4F66E0 0%,#7C5CE0 100%);--hvai-danger:#C44E4E;--hvai-field:rgba(255,255,255,.9);--hvai-hi:rgba(255,255,255,.9);
  position:fixed;z-index:76;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));height:min(680px,calc(100vh - 32px));display:flex;flex-direction:column;border-radius:28px;overflow:hidden;
  font:15.5px/1.5 'Atkinson Hyperlegible',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--hvai-ink);background:var(--hvai-bg);border:1px solid var(--hvai-line);
  box-shadow:0 30px 80px -24px rgba(30,40,90,.45),inset 0 1px 0 var(--hvai-hi);-webkit-backdrop-filter:blur(30px) saturate(160%);backdrop-filter:blur(30px) saturate(160%)}
.hvai.dark{--hvai-ink:#EEF1F7;--hvai-muted:rgba(238,241,247,.62);--hvai-bg:rgba(15,19,38,.9);--hvai-card:rgba(255,255,255,.065);--hvai-line:rgba(255,255,255,.11);--hvai-accent:#A3B6FF;--hvai-danger:#F08A80;--hvai-field:rgba(255,255,255,.07);--hvai-hi:rgba(255,255,255,.1)}
.hvai[hidden],.hvai-fab[hidden]{display:none}
body:has(.kcard.dragging) .hvai-fab,body:has(.kcard-ghost) .hvai-fab{opacity:0;pointer-events:none}
.hvai-head{display:flex;align-items:center;gap:11px;padding:14px 14px 12px 16px;border-bottom:1px solid var(--hvai-line)}
.hvai-head>svg{width:34px;height:34px;border-radius:11px;flex:none}
.hvai-ttl{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.15}
.hvai-ttl b{font:600 17px/1.2 'Sora',system-ui,sans-serif;letter-spacing:-.01em}
.hvai-ttl small{font-size:12.5px;color:var(--hvai-muted)}
.hvai-x{flex:none;width:36px;height:36px;border-radius:50%;border:1px solid var(--hvai-line);background:var(--hvai-card);color:var(--hvai-ink);display:grid;place-items:center;cursor:pointer;padding:0}
.hvai-x svg{width:16px;height:16px}
.hvai-log{flex:1;overflow-y:auto;padding:16px 14px 8px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain;scrollbar-width:thin}
.hvai-msg{max-width:86%;padding:10px 14px;border-radius:20px;white-space:pre-wrap;word-wrap:break-word}
.hvai-msg.ai{align-self:flex-start;background:var(--hvai-card);border:1px solid var(--hvai-line);border-bottom-left-radius:7px}
.hvai-msg.me{align-self:flex-end;background:var(--hvai-grad);color:#fff;border-bottom-right-radius:7px;box-shadow:0 8px 20px -12px rgba(64,88,200,.8)}
.hvai-msg.sys{align-self:center;max-width:100%;font-size:13px;color:var(--hvai-muted);background:none;padding:0 8px;text-align:center}
.hvai-sugg{align-self:flex-start;display:flex;flex-wrap:wrap;gap:8px;max-width:92%}
.hvai-sugg .b{border-radius:999px;padding:8px 14px;font-size:14px;font-weight:600;border:1px solid var(--hvai-line);background:var(--hvai-card);color:inherit;cursor:pointer}
.hvai-sugg .b:hover{border-color:currentColor}
.hvai-card{align-self:stretch;border:1px solid var(--hvai-line);border-radius:20px;padding:12px 14px;background:var(--hvai-card)}
.hvai-card.danger{border-color:var(--hvai-danger)}
.hvai-card.done{opacity:.6}
.hvai-ct{font:600 11.5px/1.3 'Sora',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--hvai-muted)}
.hvai-card.danger .hvai-ct{color:var(--hvai-danger)}
.hvai-cx{font-weight:700;margin-top:3px}
.hvai-cs{font-size:13.5px;color:var(--hvai-muted);margin-top:2px}
.hvai-plan{margin:6px 0 0;padding-left:18px;font-size:13.5px}
.hvai-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.hvai button.b,.hvai a.b{border-radius:999px;border:1px solid var(--hvai-line);background:transparent;color:var(--hvai-ink);padding:7px 15px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;min-height:38px;box-sizing:border-box}
.hvai button.b.p,.hvai a.b.p{background:var(--hvai-grad);border-color:transparent;color:#fff;box-shadow:0 8px 18px -10px rgba(64,88,200,.9)}
.hvai button.b.hvai-del{background:var(--hvai-danger);border-color:transparent;color:#fff}
.hvai-opt{display:block;width:100%;text-align:left;margin-top:6px}
.hvai-blocks{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.hvai-blk{border:1px solid var(--hvai-line);border-left:4px solid var(--hvai-accent);border-radius:14px;padding:8px 10px;background:var(--hvai-field)}
.hvai-blk.k-rest{border-left-color:#1baf7a}.hvai-blk.k-meal{border-left-color:#eb6834}.hvai-blk.k-free{border-left-color:#9a9aa3}
.hvai-bt{display:flex;align-items:center;gap:6px}
.hvai-edit .hvai-bt input{flex:1;min-width:0;border:0;background:transparent;padding:4px 2px;font-weight:700;font-size:15.5px;border-radius:8px}
.hvai-edit .hvai-bt input:focus{outline:2px solid var(--hvai-accent)}
.hvai-star,.hvai-bx{flex:none;width:30px;height:30px;border-radius:50%;border:0;background:transparent;color:var(--hvai-muted);font-size:18px;line-height:1;cursor:pointer}
.hvai-star.on{color:#E0A83E}.hvai-bx:hover,.hvai-star:hover{background:var(--hvai-card)}
.hvai-bm{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}
.hvai-stp{display:inline-flex;align-items:center;border:1px solid var(--hvai-line);border-radius:999px;overflow:hidden}
.hvai-stp button{border:0;background:transparent;color:var(--hvai-ink);width:28px;height:28px;font-size:17px;cursor:pointer}.hvai-stp button:hover{background:var(--hvai-card)}
.hvai-stp b{font-size:13px;min-width:58px;text-align:center;font-variant-numeric:tabular-nums}
.hvai-kind{border:1px solid var(--hvai-line);background:var(--hvai-card);color:var(--hvai-ink);border-radius:999px;padding:4px 11px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.hvai button.hvai-addb{margin-top:8px;border-style:dashed;width:100%}
.hvai-edit label{display:block;font-size:12.5px;color:var(--hvai-muted);margin:8px 0 3px}
.hvai-edit input,.hvai-edit select,.hvai-edit textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:9px 11px;border-radius:12px;border:1px solid var(--hvai-line);background:var(--hvai-field);color:var(--hvai-ink);color-scheme:light dark}
.hvai-bar{padding:10px 12px max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--hvai-line)}
.hvai-box{display:flex;align-items:flex-end;gap:4px;padding:5px;border-radius:26px;border:1px solid var(--hvai-line);background:var(--hvai-field);transition:border-color .2s,box-shadow .2s}
.hvai-box:focus-within{border-color:var(--hvai-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--hvai-accent) 22%,transparent)}
.hvai .hvai-in{flex:1;min-width:0;width:auto;min-height:40px;margin:0;border-radius:0;box-shadow:none;resize:none;border:0;outline:0;background:transparent;color:var(--hvai-ink);font:inherit;font-size:16px;line-height:22px;height:40px;max-height:124px;padding:9px 6px 9px 12px;box-sizing:border-box;overflow-y:hidden;scrollbar-width:none;white-space:pre-wrap}
.hvai .hvai-in::-webkit-scrollbar{display:none}
.hvai .hvai-in::placeholder{color:var(--hvai-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hvai-mic,.hvai-send{flex:none;width:40px;height:40px;border-radius:50%;border:0;padding:0;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:none;transition:transform .15s,background .2s,opacity .2s}
.hvai-mic svg,.hvai-send svg{width:20px;height:20px;display:block}
.hvai-mic{background:transparent;color:var(--hvai-muted)}
.hvai-mic:hover{color:var(--hvai-ink);background:var(--hvai-card)}
.hvai-mic.rec{background:var(--hvai-danger);color:#fff;animation:hvaiPulse 1s ease-in-out infinite}
.hvai-send{background:var(--hvai-grad);color:#fff;box-shadow:0 6px 14px -8px rgba(64,88,200,.9)}
.hvai-send:active,.hvai-mic:active{transform:scale(.93)}
.hvai-send:disabled{opacity:.4;cursor:default}
.hvai-hint{font-size:12px;color:var(--hvai-muted);text-align:center;margin-top:6px}
.hvai-typing{align-self:flex-start;color:var(--hvai-muted);font-size:13.5px;padding:2px 6px}
@keyframes hvaiPulse{50%{box-shadow:0 0 0 8px rgba(196,78,78,.2)}}
@media(max-width:640px){.hvai{right:0;left:0;bottom:0;width:100%;height:88vh;height:88dvh;border-radius:26px 26px 0 0;border-bottom:0}}
`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EDIT_FIELDS = {
    addJob: ["role", "company", "link", "source", "location", "stage", "notes"], updateJob: ["new_title", "link", "source", "location", "priority", "deadline", "notes"],
    moveStage: ["stage"], deleteJob: [], addFollowUp: ["title", "due_date", "type", "notes"], completeFollowUp: [],
    addEvent: ["title", "date", "time", "duration_min", "type", "notes"], buildDayPlan: ["blocks"], editDayPlan: ["blocks"],
  };
  const ENUMS = { stage: STAGES, priority: PRIORITIES, type: null };

  let carryOver = null;                               // a guest's chat, handed to the next mount after sign-in (HV Vault remounts)
  function mount(host) {
    if (typeof document === "undefined" || document.querySelector(".hvai-fab")) return null;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    /* Chat history. On the website it belongs to the signed-in Google account (users/{uid}/ai/<app>,
       with a per-account copy in this browser), so it follows you across devices. Guests' chats stay
       in this tab only. The desktop app keeps it in this computer's storage, as before. */
    const HKEY = "hvai-history-" + (host.app || "app");
    const CL = () => (window.HVCloud && window.HVCloud.configured ? window.HVCloud : null);
    const HPATH = "ai/" + (host.app || "app");
    let history = [], histUid = null, histT = 0, histTimer = null, carry = null, dead = false;
    const hkey = () => HKEY + (histUid ? "@" + histUid : "");
    function loadLocal() {
      history = []; histT = 0;
      if (CL() && !histUid) return;                                     // guest: nothing stored
      try { const o = JSON.parse(localStorage.getItem(hkey()) || "[]"); if (Array.isArray(o)) history = o; else if (o && Array.isArray(o.h)) { history = o.h; histT = o.t || 0; } } catch (e) {}
    }
    async function pushHist() {
      const c = CL(), uid = histUid; if (!c || !uid || !c.user || c.user.uid !== uid) return;
      try { await c.putValue(HPATH, JSON.stringify(history), histT || Date.now(), 0); }
      catch (e) { clearTimeout(histTimer); histTimer = setTimeout(pushHist, 8000); }
    }
    async function pullHist() {
      const c = CL(), uid = histUid; if (!c || !uid) return;
      let g = null; try { g = await c.getValue(HPATH); } catch (e) { return; }
      if (uid !== histUid || dead) return;
      let changed = false;
      if (g && g.t > histT) { try { history = JSON.parse(g.value) || []; histT = g.t; changed = true; } catch (e) {} }
      if (!history.length) {                                            // this browser's chats from before accounts
        try { const old = JSON.parse(localStorage.getItem(HKEY) || "[]"); if (Array.isArray(old) && old.length) { history = old; changed = true; } localStorage.removeItem(HKEY); } catch (e) {}
      }
      if (carry && carry.length) { history = history.concat(carry); changed = true; }   // what they asked before signing in
      carry = null;
      if (changed) { save(); rerender(); }
      else if (!g && history.length) pushHist();
    }
    function useAccount() {
      const c = CL(); if (!c) return;
      const u = c.user ? c.user.uid : null;
      if (u === histUid) return;
      if (histUid && !u) { try { localStorage.removeItem(hkey()); localStorage.removeItem("hvai-name@" + histUid); } catch (e) {} toldName = ""; }   // signed out: this browser forgets the chat
      if (!histUid && u && toldName) { try { localStorage.setItem("hvai-name@" + u, toldName); } catch (e) {} }   // a guest who told their name keeps it after sign-in
      if (!histUid && u && history.length) carry = history.slice();
      histUid = u; loadLocal(); rerender();
      if (u) pullHist();
    }
    histUid = CL() && CL().user ? CL().user.uid : null; loadLocal();
    if (histUid && carryOver) { carry = carryOver; } carryOver = null;
    let lastUndo = null, busy = false;
    const fab = document.createElement("button"); fab.className = "hvai-fab"; fab.setAttribute("aria-label", "Open HV AI"); fab.innerHTML = (host.logoSVG || "") + "<span>HV AI</span>";
    const panel = document.createElement("section"); panel.className = "hvai"; panel.hidden = true; panel.setAttribute("aria-label", "HV AI");
    const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
    const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
    const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const headLogo = String(host.logoSVG || "").replace(/id="([^"]+)"/g, 'id="$1-h"').replace(/url\(#([^)]+)\)/g, "url(#$1-h)");   // own gradient ids: the button's copy is hidden while the panel is open
    panel.innerHTML = '<div class="hvai-head">' + headLogo + '<div class="hvai-ttl"><b>HV AI</b><small>Hindi · English · Hinglish</small></div><button class="hvai-x" aria-label="Close HV AI">' + ICON_X + '</button></div>' +
      '<div class="hvai-log" role="log" aria-live="polite"></div>' +
      '<div class="hvai-bar"><div class="hvai-box"><textarea class="hvai-in" rows="1" placeholder="Bolo ya likho…"></textarea><button class="hvai-mic" aria-label="Hold to talk" title="Hold to talk">' + ICON_MIC + '</button><button class="hvai-send" aria-label="Send">' + ICON_SEND + '</button></div><div class="hvai-hint">Hold the mic to talk · Enter to send</div></div>';
    if (host.fabCSS) { const x = document.createElement("style"); x.setAttribute("data-hvai-fab", ""); x.textContent = host.fabCSS; document.head.appendChild(x); }   // e.g. lift it above a sticky button bar
    document.body.appendChild(fab); document.body.appendChild(panel);
    const log = panel.querySelector(".hvai-log"), input = panel.querySelector(".hvai-in"), mic = panel.querySelector(".hvai-mic"), send = panel.querySelector(".hvai-send");
    const save = () => {
      history = history.slice(-60);
      if (!CL()) { try { localStorage.setItem(HKEY, JSON.stringify(history)); } catch (e) {} return; }   // desktop
      if (!histUid) return;                                             // guest
      histT = Date.now();
      try { localStorage.setItem(hkey(), JSON.stringify({ t: histT, h: history })); } catch (e) {}
      clearTimeout(histTimer); histTimer = setTimeout(pushHist, 1200);
    };
    function rerender() { if (typeof log === "undefined" || !log) return; log.innerHTML = ""; if (!panel.hidden) open(); }
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const add = (cls, html) => { const el = document.createElement("div"); el.className = cls; el.innerHTML = html; log.appendChild(el); scroll(); return el; };
    const say = (who, text0, keep) => { const text = who === "user" ? text0 : to12(text0); add("hvai-msg " + (who === "user" ? "me" : who === "sys" ? "sys" : "ai"), esc(text)); if (keep !== false && who !== "sys") { history.push({ role: who === "user" ? "user" : "ai", text }); save(); } };
    /* The person's first name: from their profile, else the name they told HV AI, else their Google
       account. A new person is asked once ("Aapka naam kya hai?"); the answer is kept for this account
       (a guest: this tab only) and used in every greeting after that. */
    let toldName = "", askingName = false;
    const nameKey = () => "hvai-name" + (CL() && CL().user ? "@" + CL().user.uid : "");
    const storedName = () => { if (toldName) return toldName; if (CL() && !CL().user) return ""; try { return localStorage.getItem(nameKey()) || ""; } catch (e) { return ""; } };
    const firstName = () => { const cu = CL() && CL().user; const n = String((host.userName && host.userName()) || storedName() || (cu && cu.name) || "").trim().split(/\s+/)[0] || ""; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ""; };
    const hello = () => { const h = new Date().getHours(); return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
    // "Priya", "mera naam Priya hai", "I'm Priya", "my name is Priya" -> "Priya"; a request or a long sentence -> ""
    function nameFrom(t) {
      let x = String(t).trim().replace(/[.!,]+$/g, "");
      x = x.replace(/^(hi|hello|hey|namaste)[, ]+/i, "").replace(/^(mera|meraa|my)\s+(naam|name)\s+(is\s+|hai\s+)?/i, "").replace(/^(i am|i'm|im|main|mai|me)\s+/i, "").replace(/\s+(hai|hoon|hu|hun|here)$/i, "").trim();
      const w = x.split(/\s+/);
      if (!x || w.length > 3 || /\d|[?@/:]/.test(x)) return "";
      if (/^(kal|aaj|plan|add|job|meeting|interview|task|mujhe|please|kya|kaise|help|yes|no|haan|nahi|ok)$/i.test(w[0])) return "";
      return w[0].length >= 2 && w[0].length <= 20 ? w[0] : "";
    }
    const cfg = () => (host.getSettings && host.getSettings()) || {};
    const theme = () => panel.classList.toggle("dark", !!(host.isDark && host.isDark()));
    function open() {
      theme(); panel.hidden = false; fab.hidden = true;
      if (!log.childElementCount) {
        history.slice(-20).forEach((h) => add("hvai-msg " + (h.role === "user" ? "me" : "ai"), esc(h.text)));
        const c = cfg();
        if (!hasAI(c)) say("ai", host.keyHelp || "HV AI needs an AI key. Open HV Vault > Settings > HV AI, paste your Gemini key (free from aistudio.google.com) and save. Then come back here.", false);
        else if (firstName()) say("ai", hello() + ", " + firstName() + "! " + (host.app === "reset" ? "How can I help you plan your day?" : "Bolo, kya karna hai?"), false);
        else say("ai", hello() + "! I'm HV AI. " + (host.app === "reset" ? "How can I help you plan your day?" : "How can I help with your job search today?"), false);   // no name question: just help
        if (hasAI(c) && !history.length) suggest();
      }
      setTimeout(() => input.focus(), 50);
    }
    /* A new conversation gets 2-3 ready prompts. Tapping one sends it (HV Reset) or puts it in the box to edit (HV Vault, whose examples name companies). */
    const SUGG = host.suggestions || (host.app === "reset"
      ? [["Plan my day", "Plan my day: study 9 to 1, lunch at 1, gym at 6 PM", true], ["Plan tomorrow", "Plan tomorrow: work 10 to 6 with a lunch break at 1", true], ["Add a walk", "Add a 30 minute walk at 7 PM today", true]]
      : [["Add an interview", "Kal 4 baje ___ ka interview hai", false], ["Save a follow-up", "Follow up with ___ on Friday", false], ["What's due today?", "What follow-ups are due today?", true]]);
    function suggest() {
      const box = add("hvai-sugg", SUGG.map((x, i) => '<button type="button" class="b" data-i="' + i + '">' + esc(x[0]) + '</button>').join(""));
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { const x = SUGG[+b.dataset.i]; box.remove();
        if (x[2]) run(x[1]); else { input.value = x[1]; grow(); input.focus(); const k = input.value.indexOf("___"); if (k >= 0) input.setSelectionRange(k, k + 3); } }));
    }
    function close() { panel.hidden = true; fab.hidden = false; }
    fab.addEventListener("click", open); panel.querySelector(".hvai-x").addEventListener("click", close);
    const offAcc = CL() ? CL().onChange(useAccount) : null;
    if (histUid) pullHist();
    const grow = () => { input.style.height = "auto"; const h = input.scrollHeight; input.style.height = Math.min(124, Math.max(40, h)) + "px"; input.style.overflowY = h > 124 ? "auto" : "hidden"; };
    input.addEventListener("input", grow);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } });
    send.addEventListener("click", () => run());

    /* ---- cards ---- */
    function cardFor(res, batch) {
      const el = document.createElement("div"); el.className = "hvai-card"; log.appendChild(el);
      const item = { res, el, state: "pending", batch }; batch.items.push(item);
      paint(item, batch); scroll(); return item;
    }
    /* the day-plan editor: one small card per task, all taps (no dropdowns or time pickers) */
    const KLAB = { apply: "Work", prep: "Work", outreach: "Work", work: "Work", close: "Work", meal: "Meal", rest: "Break", free: "Free time" };
    const KNEXT = { work: "rest", apply: "rest", prep: "rest", outreach: "rest", close: "rest", rest: "meal", meal: "free", free: "work" };
    const hm2m = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? (+m[1]) * 60 + (+m[2]) : 540; };
    const m2hm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
    const durT = (d) => d < 60 ? d + " min" : Math.floor(d / 60) + "h" + (d % 60 ? " " + (d % 60) + "m" : "");
    function blocksHTML(list) {
      if (!list.length) return '<p class="hvai-cs">No tasks yet. Add one below.</p>';
      return list.map((b, i) => '<div class="hvai-blk k-' + esc(KLAB[b.kind] ? b.kind : "work") + '">' +
        '<div class="hvai-bt"><input data-bt="' + i + '" value="' + esc(b.title) + '" placeholder="Task name" aria-label="Task name">' +
        '<button type="button" class="hvai-star' + (b.core ? " on" : "") + '" data-bl="core" data-i="' + i + '" aria-pressed="' + b.core + '" title="Must do">' + (b.core ? "\u2605" : "\u2606") + '</button>' +
        '<button type="button" class="hvai-bx" data-bl="del" data-i="' + i + '" aria-label="Remove task">\u00d7</button></div>' +
        '<div class="hvai-bm"><span class="hvai-stp"><button type="button" data-bl="t-" data-i="' + i + '" aria-label="15 minutes earlier">\u2039</button><b>' + esc(to12(m2hm(hm2m(b.start)))) + '</b><button type="button" data-bl="t+" data-i="' + i + '" aria-label="15 minutes later">\u203a</button></span>' +
        '<span class="hvai-stp"><button type="button" data-bl="d-" data-i="' + i + '" aria-label="5 minutes shorter">\u2039</button><b>' + esc(durT(b.duration_min)) + '</b><button type="button" data-bl="d+" data-i="' + i + '" aria-label="5 minutes longer">\u203a</button></span>' +
        '<button type="button" class="hvai-kind" data-bl="kind" data-i="' + i + '">' + esc(KLAB[b.kind] || "Work") + '</button></div></div>').join("");
    }
    function blockAct(item, batch, btn) {
      const L = item.draft, i = +btn.dataset.i, b = L[i], op = btn.dataset.bl;
      if (op === "add") { const last = L[L.length - 1]; L.push({ start: last ? m2hm(hm2m(last.start) + last.duration_min) : "09:00", duration_min: 30, title: "", kind: "work", core: false }); }
      else if (op === "del") L.splice(i, 1);
      else if (op === "core") b.core = !b.core;
      else if (op === "kind") b.kind = KNEXT[b.kind] || "work";
      else if (op === "t-" || op === "t+") b.start = m2hm(hm2m(b.start) + (op === "t+" ? 15 : -15));
      else if (op === "d-" || op === "d+") b.duration_min = Math.max(5, Math.min(600, b.duration_min + (op === "d+" ? 5 : -5)));
      const box = item.el.querySelector(".hvai-blocks"); box.innerHTML = blocksHTML(L);
      box.querySelectorAll("[data-bl]").forEach((x) => x.addEventListener("click", () => blockAct(item, batch, x)));
      box.querySelectorAll("[data-bt]").forEach((f) => f.addEventListener("input", () => { L[+f.dataset.bt].title = f.value; }));
      if (op === "add") { const f = box.querySelector('[data-bt="' + (L.length - 1) + '"]'); if (f) f.focus(); }
    }
    function paint(item, batch) {
      const r = item.res, el = item.el, data = host.getData ? host.getData() : null;
      el.className = "hvai-card";
      if (r.status === "choose") {
        if (r.next) openQ = item;
        const hint = r.ask === "meals" ? "Or type your own time, like \u201clunch 2 baje\u201d." : r.ask === "dup" ? "Or just type \u201cek hi hai\u201d or \u201calag alag\u201d." : "";
        el.innerHTML = '<div class="hvai-ct">' + (r.next ? "Quick question" : "Which one?") + '</div><div class="hvai-cx">' + esc(r.message) + '</div>' + (hint ? '<div class="hvai-cs">' + hint + '</div>' : '') + r.options.map((o) => '<button class="b hvai-opt" data-id="' + esc(o.id) + '">' + esc(o.label) + '</button>').join("") + '<div class="hvai-row"><button class="b" data-a="cancel">Cancel</button></div>';
        el.querySelectorAll(".hvai-opt").forEach((b) => b.addEventListener("click", () => { if (r.next) { const n = r.next(b.dataset.id); item.res = prepare(n.action, host, n.meta); } else item.res = choose(r, b.dataset.id); paint(item, batch); }));
      } else if (r.status === "handoff") {
        const d = describe(r.action, data);
        el.innerHTML = '<div class="hvai-ct">' + esc(d.icon + " " + d.title) + '</div><div class="hvai-cx">' + esc(d.text) + "</div>" + (d.sub ? '<div class="hvai-cs">' + esc(d.sub) + "</div>" : "") +
          (d.plan ? '<ol class="hvai-plan">' + d.plan.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : "") +
          '<div class="hvai-cs">Your day plan lives in HV Reset. Open it there to confirm.</div><div class="hvai-row"><a class="b p" style="text-decoration:none;display:inline-flex;align-items:center" href="' + esc(r.url) + '">Open in HV Reset</a><button class="b" data-a="cancel">Cancel</button></div>';
        item.state = "handoff";
      } else if (r.status === "notfound" || r.status === "invalid") {
        el.innerHTML = '<div class="hvai-ct">Can\'t do this one</div><div class="hvai-cs">' + esc(r.message) + '</div>'; item.state = "skipped";
      } else if (item.state === "edit") {
        const a = r.action.args, fields = EDIT_FIELDS[r.action.type] || [];
        if (fields.indexOf("blocks") >= 0 && !item.draft) item.draft = (a.blocks || []).map((b) => ({ start: b.start, duration_min: Number(b.duration_min) || 30, title: b.title || "", kind: b.kind || "work", core: !!b.core }));
        el.innerHTML = '<div class="hvai-ct">Edit</div><div class="hvai-edit">' + fields.map((k) => {
          if (k === "blocks") return '<div class="hvai-blocks">' + blocksHTML(item.draft) + '</div><button type="button" class="b hvai-addb" data-bl="add">+ Add task</button>';
          const v = k === "blocks" ? (a.blocks || []).map((b) => [b.start, b.duration_min, b.title, b.kind, b.core ? "core" : ""].join(" | ")).join("\n") : (a[k] == null ? "" : a[k]);
          const en = k === "type" ? (r.action.type === "addEvent" ? EVENT_TYPES : FU_TYPES) : ENUMS[k];
          const inp = k === "blocks" ? '<textarea rows="7" data-k="blocks">' + esc(v) + "</textarea>" : en ? '<select data-k="' + k + '"><option value=""></option>' + en.map((o) => "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select>" :
            '<input data-k="' + k + '" value="' + esc(v) + '"' + (/date|deadline/.test(k) ? ' type="date"' : k === "time" ? ' type="time"' : "") + ">";
          return "<label>" + esc(k === "blocks" ? "Blocks: start | minutes | title | kind | core" : k.replace("_", " ")) + "</label>" + inp;
        }).join("") + '</div><div class="hvai-row"><button class="b p" data-a="saveedit">Save</button><button class="b" data-a="canceledit">Back</button></div>';
        el.querySelectorAll("[data-bl]").forEach((b) => b.addEventListener("click", () => blockAct(item, batch, b)));
        el.querySelectorAll("[data-bt]").forEach((f) => f.addEventListener("input", () => { item.draft[+f.dataset.bt].title = f.value; }));
      } else if (item.state === "done" || item.state === "cancelled") {
        const d = describe(r.action, data);
        el.className = "hvai-card done"; el.innerHTML = '<div class="hvai-ct">' + (item.state === "done" ? "Done · " : "Cancelled · ") + esc(d.title) + '</div><div class="hvai-cx">' + esc(d.text) + "</div>";
      } else {
        const d = describe(r.action, data);
        if (d.danger) el.className = "hvai-card danger";
        el.innerHTML = '<div class="hvai-ct">' + esc(d.icon + " " + d.title) + '</div><div class="hvai-cx">' + esc(d.text) + "</div>" + (d.sub ? '<div class="hvai-cs">' + esc(d.sub) + "</div>" : "") +
          (d.plan ? '<ol class="hvai-plan">' + d.plan.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : "") +
          '<div class="hvai-row"><button class="b ' + (d.danger ? "hvai-del" : "p") + '" data-a="confirm">' + (d.danger ? "Delete" : "Confirm") + '</button>' + ((EDIT_FIELDS[r.action.type] || []).length ? '<button class="b" data-a="edit">Edit</button>' : "") + '<button class="b" data-a="cancel">Cancel</button></div>';
      }
      el.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => act(item, batch, b.dataset.a)));
    }
    async function act(item, batch, a) {
      if (a === "cancel") { item.state = "cancelled"; paint(item, batch); noteCancelled([item]); return footer(batch); }
      if (a === "edit") { item.state = "edit"; return paint(item, batch); }
      if (a === "canceledit") { item.state = "pending"; item.draft = null; return paint(item, batch); }
      if (a === "saveedit") {
        const args = Object.assign({}, item.res.action.args);
        item.el.querySelectorAll("[data-k]").forEach((f) => {
          const k = f.dataset.k, v = f.value.trim();
          if (k === "blocks" && f.tagName !== "TEXTAREA") return;
          if (k === "blocks") args.blocks = v.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p.length >= 3).map((p) => ({ start: p[0], duration_min: Number(p[1]), title: p[2], kind: BLOCK_KINDS.indexOf(p[3]) >= 0 ? p[3] : "work", core: /core/i.test(p[4] || "") }));
          else if (k === "duration_min") { if (v) args[k] = Number(v); else delete args[k]; }
          else if (v) args[k] = v; else delete args[k];
        });
        delete args.notes;                                                // added by prepare() for display; not part of the action
        if (item.draft) { args.blocks = item.draft.filter((b) => b.title.trim()).map((b) => ({ start: m2hm(hm2m(b.start)), duration_min: b.duration_min, title: b.title.trim(), kind: b.kind, core: !!b.core })).sort((x, y) => hm2m(x.start) - hm2m(y.start)); item.draft = null; }
        const next = prepare({ type: item.res.action.type, args }, host, Object.assign({}, item.res.meta, { dupsOk: true, meals: (item.res.meta && item.res.meta.meals) || "yes" }));   // the user edited it by hand: don't ask again
        item.res = next; item.state = "pending"; paint(item, batch); return;
      }
      if (a === "confirm") return execute(batch, [item]);
    }
    function footer(batch) {
      const pending = batch.items.filter((i) => i.state === "pending" && i.res.status === "ready");
      if (batch.footer) batch.footer.remove(); batch.footer = null;
      if (pending.length > 1) {
        batch.footer = add("hvai-row", '<button class="b p" data-a="all">Confirm all ' + pending.length + '</button><button class="b" data-a="none">Cancel all</button>');
        batch.footer.querySelector('[data-a="all"]').addEventListener("click", () => execute(batch, pending));
        batch.footer.querySelector('[data-a="none"]').addEventListener("click", () => { pending.forEach((i) => { i.state = "cancelled"; paint(i, batch); }); noteCancelled(pending); footer(batch); });
      }
    }
    // the user said no: the next request must not reuse this proposal
    function noteCancelled(items) {
      const names = items.map((i) => { try { return describe(i.res.action, host.getData && host.getData()).title; } catch (e) { return i.res.action.type; } });
      history.push({ role: "ai", text: "[CANCELLED by the user: " + names.join(", ") + ". This proposal is void. Do not reuse any of its blocks, times or details.]" }); save();
    }
    async function execute(batch, items) {
      if (busy) return; busy = true;
      try {
        const res = await host.execute(items.map((i) => i.res.action));
        items.forEach((i) => { i.state = "done"; paint(i, batch); });
        (res && res.messages || []).forEach((m) => say("sys", m, false));
        if (res && res.undo) {
          lastUndo = res.undo;
          const u = add("hvai-row", '<button class="b" data-a="undo">Undo</button>');
          u.querySelector("button").addEventListener("click", async () => { if (lastUndo !== res.undo) { say("sys", "Only the last change can be undone.", false); return; } const m = await res.undo(); lastUndo = null; u.remove(); say("sys", m || "Undone.", false); });
        }
        history.push({ role: "ai", text: "[applied: " + items.map((i) => describe(i.res.action, host.getData && host.getData()).title).join(", ") + "]" }); save();
      } catch (e) { say("sys", "Couldn't apply: " + (e && e.message || e), false); }
      finally { busy = false; footer(batch); }
    }
    /* HV AI thinks before it plans: anything that looks off becomes a one-tap question, never a silent guess */
    const durText = (d) => d < 60 ? d + " min" : Math.floor(d / 60) + "h" + (d % 60 ? " " + (d % 60) + "m" : "");
    function dupPair(blocks) {                                           // the same task twice, back to back ("Project" 8-9 and 9-10)
      const l = (blocks || []).map((b, i) => ({ i, s: toMin(b.start), e: toMin(b.start) + (Number(b.duration_min) || 0), t: norm(b.title), k: b.kind, b })).sort((x, y) => x.s - y.s);
      for (let j = 1; j < l.length; j++) { const a = l[j - 1], c = l[j];
        if (a.t && a.t === c.t && ["meal", "rest", "free"].indexOf(a.k) < 0 && c.s - a.e >= 0 && c.s - a.e <= 15) return [a, c]; }
      return null;
    }
    function prepare(action, h, meta) {
      meta = meta || {};
      action = normalize(action);
      const data = h.getData ? h.getData() : null;
      if ((action.type === "buildDayPlan" || action.type === "editDayPlan") && !(action.args && Array.isArray(action.args.blocks) && action.args.blocks.length))
        return { status: "invalid", action, message: "A plan needs at least one task. To remove tasks or empty a day, just say what to delete and I'll show it to you first." };
      if (action.type === "deleteTasks" || action.type === "clearPlans") {
        const v = validate(action);
        if (!v.ok) return { status: "invalid", action, message: action.type === "deleteTasks" ? "Which task should I delete, and on which day?" : "Which days should I clear?" };
        const r = h.previewDelete ? h.previewDelete(action) : { ok: false, message: "Deleting isn't available here." };
        if (!r.ok) return { status: "invalid", action, message: r.message };
        return { status: "ready", action: Object.assign({}, action, { resolved: r }) };
      }
      if ((action.type === "buildDayPlan" || action.type === "editDayPlan") && validate(action).ok) {
        const today = istNow().date;
        if (action.args.date && action.args.date < today) return { status: "invalid", action, message: niceDate(action.args.date) + " has already passed. Which day should I plan: today or tomorrow?" };
        const dp = meta.dupsOk ? null : dupPair(action.args.blocks);
        if (dp) {
          const a = dp[0], c = dp[1], name = a.b.title;
          return { status: "choose", ask: "dup", action, meta, message: "\u201c" + name + "\u201d is at " + niceTime(hhmm(a.s)) + " and again at " + niceTime(hhmm(c.s)) + ". Is it one task, or two separate sessions?",
            options: [{ id: "one", label: "One task, " + niceTime(hhmm(a.s)) + " to " + niceTime(hhmm(c.e)) + " (" + durText(c.e - a.s) + ")" }, { id: "two", label: "Two separate sessions" }],
            next: (id) => { const args = Object.assign({}, action.args);
              if (id === "one") args.blocks = action.args.blocks.filter((b, i) => i !== c.i).map((b) => b === a.b ? Object.assign({}, b, { duration_min: c.e - a.s }) : b);
              return { action: { type: action.type, args }, meta: Object.assign({}, meta, { dupsOk: true }) }; } };
        }
        const cur = action.type === "editDayPlan" && h.getPlan ? (h.getPlan() || {}).blocks : null;
        const curL = cur && cur.map((b) => ({ id: b.id, start: b.start, duration_min: b.duration_min, title: b.title, kind: b.kind, core: b.core, done: b.done }));
        const f = fixPlan(action.args.blocks, curL, { meals: meta.meals !== "no" });
        if (!meta.meals && f.addedMeals.length) {
          const one = f.addedMeals.length === 1, what = one ? f.addedMeals[0].split(" ")[0].toLowerCase() : "lunch and dinner";
          return { status: "choose", ask: "meals", askMeals: f.addedMeals.map((x) => x.split(" ")[0]), action, meta, message: "Your plan runs through " + what + " time. Add " + f.addedMeals.join(" and ") + "?",
            options: [{ id: "yes", label: "Yes, add " + (one ? what : "both") }, { id: "no", label: "No, skip meals" }],
            next: (id) => ({ action, meta: Object.assign({}, meta, { meals: id }) }) };
        }
        action = { type: action.type, args: Object.assign({}, action.args, { blocks: f.blocks, notes: f.notes }) };
        if (!h.canPlan) return h.planHandoff ? { status: "handoff", action, url: h.planHandoff(action) } : { status: "notfound", action, message: "Day plans live in HV Reset. Open Reset and ask HV AI there." };
        const v = validate({ type: action.type, args: { date: action.args.date, blocks: action.args.blocks } });
        return v.ok ? { status: "ready", action, meta } : { status: "invalid", action, message: v.errors.join("; ") };
      }
      return resolve(action, data, { today: istNow().date });
    }
    /* A question card can also be answered by typing: "lunch 2 baje", "dinner 9:30", "ek hi task hai",
       "alag alag", "no meals". What isn't understood here goes to the AI along with the pending plan. */
    let openQ = null;
    const pendingQ = () => (openQ && openQ.state === "pending" && openQ.res.status === "choose" && openQ.res.next && openQ.el.isConnected ? openQ : null);
    function mealTimes(text, asked) {
      const out = {}, segs = String(text).toLowerCase().split(/\s*(?:,|;|\baur\b|\band\b|\bthen\b)\s*/);
      segs.forEach((seg) => {
        const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/.exec(seg); if (!m) return;
        let name = /lunch|dopahar|afternoon/.test(seg) ? "Lunch" : /dinner|raat|night|shaam/.test(seg) ? "Dinner" : (asked.length === 1 ? asked[0] : null);
        let h = +m[1]; const mi = m[2] ? +m[2] : 0, ap = (m[3] || "").replace(/\./g, "");
        if (!name) name = (ap === "pm" && h >= 6 && h < 12) || (!ap && h >= 7 && h <= 11 && /raat|night/.test(seg)) ? "Dinner" : "Lunch";
        if (ap === "pm" && h < 12) h += 12; else if (ap === "am" && h === 12) h = 0;
        else if (!ap) { if (name === "Lunch" && h >= 1 && h <= 6) h += 12; if (name === "Dinner" && h < 12) h += 12; }
        if (h > 23 || mi > 59) return;
        out[name] = String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0");
      });
      return out;
    }
    function answerTyped(q, text) {
      const r = q.res, t = text.toLowerCase();
      let pick = null, action = null, meta = r.meta || {};
      if (r.ask === "dup") {
        if (/\b(ek|one|single|same|ek hi|1 task|ek task|combine|merge|milake)\b/.test(t) && !/\b(two|alag|separate|different|do alag)\b/.test(t)) pick = "one";
        else if (/\b(two|alag|separate|different|do|2)\b/.test(t)) pick = "two";
      } else if (r.ask === "meals") {
        const times = mealTimes(text, r.askMeals || []);
        if (Object.keys(times).length) {
          const args = Object.assign({}, r.action.args);
          args.blocks = (args.blocks || []).filter((b) => !(b.kind === "meal" && times[b.title])).concat(Object.keys(times).map((n) => ({ start: times[n], duration_min: 30, title: n, kind: "meal", core: false })))
            .sort((x, y) => toMin(x.start) - toMin(y.start));                 // in time order, or a later block reads as the next day
          action = { type: r.action.type, args };
          const rest = (r.askMeals || []).filter((n) => !times[n]);
          meta = Object.assign({}, meta, rest.length ? {} : { meals: "yes" });   // a meal they didn't mention is still asked about
          if (rest.length) delete meta.meals;
        } else if (/\b(no|nahi|nahin|mat|skip|nope)\b/.test(t)) pick = "no";
        else if (/\b(yes|haan|han|ha|ok|okay|sure|theek|thik|add)\b/.test(t)) pick = "yes";
      }
      if (pick) { const n = r.next(pick); q.res = prepare(n.action, host, n.meta); }
      else if (action) q.res = prepare(action, host, meta);
      else return false;
      paint(q, q.batch || { items: [q] }); if (q.batch) footer(q.batch); return true;
    }
    async function run(textIn) {
      const text = (textIn != null ? textIn : input.value).trim();
      if (!text || busy) return;
      input.value = ""; grow();
      const c = cfg();
      { const sg = log.querySelector(".hvai-sugg"); if (sg) sg.remove(); }
      say("user", text);
      const pq = pendingQ();
      if (pq && answerTyped(pq, text)) return;                        // typed answer to the question card
      if (askingName) {                                              // the first answer after "Aapka naam kya hai?"
        askingName = false; const nm = nameFrom(text);
        if (nm) {
          toldName = nm.charAt(0).toUpperCase() + nm.slice(1).toLowerCase();
          if (!(CL() && !CL().user)) { try { localStorage.setItem(nameKey(), toldName); } catch (e) {} }
          say("ai", "Nice to meet you, " + toldName + "! Bolo, kya karna hai? Jaise: \u201c" + (host.app === "reset" ? "Kal 10 se 6 padhai, 1 baje lunch" : "Kal 4 baje Zomato ka interview hai") + "\u201d", false);
          return;
        }
      }
      if (!hasAI(c)) { say("ai", host.keyHelp || "Add your AI key in HV Vault > Settings > HV AI first.", false); return; }
      busy = true; send.disabled = true; const typing = add("hvai-typing", "HV AI is thinking…");
      let r;
      const cw = Object.assign({}, c, { onWait: () => { typing.textContent = "Lots of people are using HV AI right now. One moment…"; } });
      let ctx = host.getContext ? host.getContext() : null;
      if (!ctx || typeof ctx !== "object") ctx = buildContext(host.getData ? host.getData() : null, host.getPlan ? host.getPlan() : null);   // never send the AI a context without today's date and time
      if (pq) ctx = Object.assign({}, ctx, { pending_question: { question: pq.res.message, plan: { date: pq.res.action.args.date, blocks: pq.res.action.args.blocks } } });
      try { r = await interpret(cw, text, ctx, history.slice(0, -1), host.app); } finally { typing.remove(); busy = false; send.disabled = false; }
      if (r.error) { say("sys", r.error === "NO_KEY" ? "Add your AI key in HV Vault > Settings > HV AI." : r.error, false); return; }
      const batch = { items: [] };
      const scope = scopeOf(host.app), all = (r.actions || []).slice(0, 12);
      const acts = all.filter((a) => a && scope.allowed.indexOf(a.type) >= 0);     // this app's HV AI only changes this app
      const away = all.filter((a) => a && acts.indexOf(a) < 0).map((a) => otherApp(host.app, a.type)).filter(Boolean);
      if (away.length) say("ai", "Ye " + away[0] + " ka kaam hai. " + away[0] + " kholo aur wahan HV AI se bolo. Yahan kuch change nahi kiya.", false);
      const proposes = acts.some((a) => a.type !== "answer" && a.type !== "askClarification");
      const tidyReply = (t) => proposes && /(kar diy|ho gay|set kar|add kar diy|bana diy|update kar diy|\bdone\b|\bupdated\b|\badded\b)/i.test(t) ? (host.app === "reset" ? "Ye raha plan. Theek lage to Confirm karo." : "Ye raha change. Theek lage to Confirm karo.") : t;
      const prepared = acts.filter((a) => a.type !== "answer" && a.type !== "askClarification").map((a) => ({ a, r: prepare(a, host) }));
      const usable = prepared.filter((x) => ["ready", "choose", "handoff"].indexOf(x.r.status) >= 0).length;
      if (!away.length && !(proposes && !usable)) acts.filter((a) => a.type === "answer" && a.args && str(a.args.text)).forEach((a) => say("ai", tidyReply(a.args.text)));   // no "here's the plan" when every card failed
      const failed = prepared.filter((x) => x.r.status === "invalid" || x.r.status === "notfound");
      if (failed.length) { history.push({ role: "ai", text: "[NOT DONE: " + failed.map((x) => x.a.type + " (" + (x.r.message || "failed") + ")").join("; ") + ". Nothing was changed.]" }); save(); }   // its reply would describe the other-app change
      acts.filter((a) => a.type === "askClarification" && a.args && str(a.args.question)).forEach((a) => {
        say("ai", a.args.question);
        const opts = Array.isArray(a.args.options) ? a.args.options.filter(str).slice(0, 5) : [];
        if (opts.length) { const row = add("hvai-row", opts.map((o) => '<button class="b">' + esc(o) + "</button>").join("")); row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { row.remove(); run(b.textContent); })); }
      });
      if (pq && acts.some((a) => a.type === "buildDayPlan" || a.type === "editDayPlan")) { pq.state = "cancelled"; paint(pq, pq.batch || { items: [pq] }); }   // the new plan replaces the one that was waiting
      prepared.forEach((x) => cardFor(x.r, batch));
      if (!acts.length && !away.length) say("ai", "Samjha nahi. Thoda aur batao?", false);
      footer(batch);
    }

    /* ---- push-to-talk ---- */
    let rec = null, chunks = [], recStart = 0, speech = null;
    const canRecord = () => !!(root.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    async function micDown(e) {
      e.preventDefault(); if (busy) return;
      const c = cfg();
      if (!hasAI(c)) { say("ai", host.keyHelp || "Add your AI key in HV Vault > Settings > HV AI first.", false); return; }
      if ((c.provider === "gemini" || c.provider === "builtin") && canRecord()) {   // Gemini hears the audio itself
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
          rec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            if (Date.now() - recStart < 500) { say("sys", "Hold the mic while you speak.", false); return; }
            const note = add("hvai-typing", "Listening back…");
            try {
              const wav = await toWavB64(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
              const t = await transcribe(c, wav);
              if (t.error) say("sys", t.error, false);
              else if (!t.text) say("sys", "Couldn't hear anything. Try again.", false);
              else { input.value = t.text; input.dispatchEvent(new Event("input")); input.focus(); say("sys", "Check the text, fix anything, then tap Send", false); }
            } catch (err) { say("sys", "Couldn't process the recording.", false); }
            finally { note.remove(); }
          };
          rec.start(); recStart = Date.now(); mic.classList.add("rec");
        } catch (err) { say("sys", "Microphone permission is needed for voice.", false); }
        return;
      }
      if (SR) {
        speech = new SR(); speech.lang = "en-IN"; speech.interimResults = true; speech.continuous = true;
        let finalText = "";
        speech.onresult = (ev) => { let s = ""; for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript + " "; finalText = s.trim(); input.value = finalText; };
        speech.onend = () => { mic.classList.remove("rec"); if (finalText) { input.dispatchEvent(new Event("input")); input.focus(); say("sys", "Check the text, fix anything, then tap Send", false); } };
        speech.onerror = () => { mic.classList.remove("rec"); };
        try { speech.start(); mic.classList.add("rec"); } catch (err) {}
        return;
      }
      say("sys", "Voice isn't supported in this browser. Type instead.", false);
    }
    function micUp(e) {
      e.preventDefault();
      if (rec && rec.state === "recording") { rec.stop(); mic.classList.remove("rec"); }
      if (speech) { try { speech.stop(); } catch (err) {} speech = null; }
    }
    mic.addEventListener("pointerdown", micDown); mic.addEventListener("pointerup", micUp); mic.addEventListener("pointerleave", micUp); mic.addEventListener("pointercancel", micUp);
    mic.addEventListener("contextmenu", (e) => e.preventDefault());

    function showActions(actions, note) {
      open(); if (note) say("ai", note, false);
      const batch = { items: [] }; (actions || []).forEach((a) => cardFor(prepare(a, host), batch)); footer(batch);
    }
    // destroy: the host app is going away (HV Vault remounts after sign-in), so a new mount can take over
    const destroy = () => {
      dead = true; if (offAcc) offAcc(); clearTimeout(histTimer);
      const guestChat = carry || (CL() && !histUid ? history : null);
      carryOver = guestChat && guestChat.length ? guestChat.slice() : null; [fab, panel, st].forEach((el) => el && el.remove()); document.querySelectorAll("style[data-hvai-fab]").forEach((el) => el.remove()); };
    return { open, close, run, showActions, destroy, setVisible: (v) => { if (!v) { panel.hidden = true; fab.hidden = true; } else if (panel.hidden) fab.hidden = false; }, refreshTheme: theme };
  }

  root.HVAI = { version: 1, guard, userRanges, pickConfig, builtInAI, hasAI, APPS, scopeOf, to12, niceTime, normTime, normalize, STAGES, TOOLS, SYSTEM, istNow, addDays, dateHints, buildContext, validate, resolve, choose, fixPlan, describe, interpret, transcribe, mount };
})(typeof window !== "undefined" ? window : globalThis);
