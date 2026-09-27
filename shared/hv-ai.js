/* HV AI: one assistant for HV Vault and Harsh Reset.
   Plain browser script (no imports/exports) that defines window.HVAI. HV Vault bundles it
   (import "./shared/hv-ai.js"); the Pages build also publishes it at /hv-vault-web/shared/hv-ai.js
   for Harsh Reset. The model only PROPOSES actions from a fixed list (function calling); every
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
  const ACTIONS = ["addJob", "updateJob", "moveStage", "deleteJob", "addFollowUp", "completeFollowUp", "addEvent", "buildDayPlan", "editDayPlan", "answer", "askClarification"];
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
        applied_this_week: (d.jobs || []).filter((j) => j.date_applied && j.date_applied >= weekStart && j.date_applied <= n.date).length,
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
    { name: "buildDayPlan", description: "Make a new Harsh Reset schedule for a day from the user's instructions.", parameters: S("object", "", { properties: {
      date: S("string", "YYYY-MM-DD."), blocks: S("array", "Blocks in time order.", { items: BLOCK }),
    }, required: ["date", "blocks"] }) },
    { name: "editDayPlan", description: "Change the existing Harsh Reset plan in context.today_plan. Return the FULL new block list; keep block_id on blocks you keep.", parameters: S("object", "", { properties: {
      date: S("string", "YYYY-MM-DD."), blocks: S("array", "The full new list of blocks.", { items: BLOCK }),
    }, required: ["date", "blocks"] }) },
    { name: "answer", description: "Reply to the user in their language (Hinglish/Hindi/English), short. For questions, answer ONLY from context.stats and context lists. When you also propose actions, say what you are proposing, never that it is done.", parameters: S("object", "", { properties: {
      text: S("string", "The reply."),
    }, required: ["text"] }) },
    { name: "askClarification", description: "Ask one short question when the request is unclear or a name matches more than one job.", parameters: S("object", "", { properties: {
      question: S("string", "The question."), options: S("array", "Up to 5 short choices.", { items: S("string", "A choice.") }),
    }, required: ["question"] }) },
  ];
  const SYSTEM = [
    "You are HV AI, the assistant inside HV Vault (job-hunt CRM) and Harsh Reset (daily plan) for Harsh.",
    "Reply in the language the user used (Hinglish, Hindi or English). Keep replies very short.",
    "You can only act through the provided functions. Always call at least one function. Always include one 'answer' call with a short reply, unless you call askClarification.",
    "Your calls are proposals: the app shows them to Harsh to confirm. Never say something is done; say what you will do after he confirms.",
    "Use ids from the context when a job/follow-up clearly matches. If a company or role matches more than one job and the user did not say which, call askClarification listing them. If nothing matches, say so in 'answer' and do not invent ids.",
    "Dates: use context.now (India time) and context.date_hints for kal, parso, weekdays and 'next <day>'. '4 baje' means 16:00 unless morning is said; '10 baje' means 10:00. Output dates as YYYY-MM-DD and times as HH:MM.",
    "'Applied mark karo' = moveStage to Applied (this auto-creates a follow-up). If the user also gives a follow-up time, add addFollowUp with in_days or due_date too.",
    "Questions like 'aaj kitne apply kiye' or 'pending follow-ups': answer from context.stats and context.followups_pending only; never guess numbers.",
    "Day plans (Harsh Reset): one block = one task. Start from context.now rounded up to the next 15 minutes unless a start is given. Keep work blocks at most 90 minutes with short breaks (kind rest) between them. Never skip a meal: include lunch around 13:30 and dinner around 20:30 when the plan covers those times. 'Free after 7' = a free block from 19:00. Mark applying, interview prep and outreach as core. When editing today_plan: core blocks may shrink but never be removed, and meal blocks stay.",
  ].join("\n");

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
  const friendlyErr = (r) => {
    const m = (r.json && r.json.error && (r.json.error.message || r.json.error)) || "";
    if (r.status === 400 && /api key/i.test(m)) return "Your AI key was rejected. Check it in HV Vault > Settings > AI.";
    if (r.status === 401 || r.status === 403) return "Your AI key isn't allowed (" + (m || r.status) + "). Check it in HV Vault > Settings > AI.";
    if (r.status === 429) return "The AI is rate-limited right now. Try again in a minute.";
    if (r.status === 404) return "That AI model isn't available. Clear the Model field in HV Vault > Settings > AI.";
    if (!r.status) return "Couldn't reach the AI (" + m + "). Check your internet.";
    return "AI error: " + (m || "HTTP " + r.status);
  };
  async function geminiActions(cfg, userText, context, history, model) {
    const contents = (history || []).slice(-8).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));
    contents.push({ role: "user", parts: [{ text: "CONTEXT (JSON):\n" + JSON.stringify(context) + "\n\nHARSH SAYS:\n" + userText }] });
    const r = await post("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(cfg.key), {
      systemInstruction: { parts: [{ text: SYSTEM }] }, contents,
      tools: [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: upperType(t.parameters) })) }],
      toolConfig: { functionCallingConfig: { mode: "ANY" } }, generationConfig: { temperature: 0.1 },
    });
    if (!r.ok) return { error: friendlyErr(r), status: r.status };
    const parts = (r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content && r.json.candidates[0].content.parts) || [];
    const calls = parts.filter((p) => p.functionCall).map((p) => ({ type: p.functionCall.name, args: p.functionCall.args || {} }));
    const text = parts.map((p) => p.text || "").join("").trim();
    if (!calls.length && text) calls.push({ type: "answer", args: { text } });
    return { actions: calls };
  }
  async function openrouterActions(cfg, userText, context, history, model) {
    const messages = [{ role: "system", content: SYSTEM }].concat((history || []).slice(-8).map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: h.text })));
    messages.push({ role: "user", content: "CONTEXT (JSON):\n" + JSON.stringify(context) + "\n\nHARSH SAYS:\n" + userText });
    const r = await post("https://openrouter.ai/api/v1/chat/completions", {
      model, messages, temperature: 0.1, tool_choice: "required",
      tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
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
  async function interpret(cfg, userText, context, history) {
    if (!cfg || !cfg.key || !cfg.provider || cfg.provider === "off") return { error: "NO_KEY" };
    if (cfg.provider === "openrouter") return openrouterActions(cfg, userText, context, history, cfg.model || DEFAULT_OR);
    const model = cfg.model || DEFAULT_GEMINI;
    let r = await geminiActions(cfg, userText, context, history, model);
    const usable = r.actions && r.actions.some((a) => validate(a).ok);
    if (!cfg.model && (r.error || !usable) && r.status !== 400 && r.status !== 401 && r.status !== 403) {   // retry once on the stronger model
      const r2 = await geminiActions(cfg, userText, context, history, FALLBACK_GEMINI);
      if (r2.actions && r2.actions.some((a) => validate(a).ok)) r = r2;
    }
    return r;
  }
  async function transcribe(cfg, wavB64) {
    const r = await post("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(cfg.model || DEFAULT_GEMINI) + ":generateContent?key=" + encodeURIComponent(cfg.key), {
      contents: [{ role: "user", parts: [
        { text: "Transcribe this voice note exactly as spoken. It may be Hindi, English or Hinglish. Write Hindi words in Latin script (Hinglish), keep English words in English, keep names, numbers and links. Output only the transcript." },
        { inlineData: { mimeType: "audio/wav", data: wavB64 } }] }],
      generationConfig: { temperature: 0 },
    }, null, 60000);
    if (!r.ok) return { error: friendlyErr(r) };
    const parts = (r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content && r.json.candidates[0].content.parts) || [];
    return { text: parts.map((p) => p.text || "").join("").trim() };
  }

  /* ---------------- validation ---------------- */
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(new Date(s + "T12:00:00Z"));
  const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s || "") && toMin(s) < 1440;
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
    if (t === "completeFollowUp" && !str(a.followup_id) && !str(a.company) && !str(a.title)) errs.push("which follow-up?");
    ["due_date", "deadline", "date"].forEach((k) => { if (a[k] && !isDate(a[k])) errs.push(k + " must be YYYY-MM-DD"); });
    if (a.time && !isTime(a.time)) errs.push("time must be HH:MM");
    if (a.link && !/^(https?:\/\/)?[^\s]+\.[^\s]+$/i.test(a.link)) errs.push("link doesn't look like a URL");
    if (t === "buildDayPlan" || t === "editDayPlan") (Array.isArray(a.blocks) ? a.blocks : []).forEach((b, i) => {
      if (!b || typeof b !== "object") { errs.push("block " + (i + 1) + " is empty"); return; }
      if (!isTime(b.start)) errs.push("block " + (i + 1) + " start must be HH:MM");
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

  /* ---------------- Harsh Reset plan rules ---------------- */
  const MEALS = [{ name: "Lunch", from: 12 * 60 + 30, to: 15 * 60, at: 13 * 60 + 30, len: 30 }, { name: "Dinner", from: 19 * 60 + 30, to: 22 * 60, at: 20 * 60 + 30, len: 30 }];
  const JOIN = /\s+(?:and|aur|&|\+|then|phir)\s+/i;
  /* one block one task; core blocks shrink but never drop; never skip a meal. Returns { blocks, notes } */
  function fixPlan(blocksIn, current) {
    const notes = [];
    let blocks = [];
    (blocksIn || []).forEach((b) => {
      const base = { block_id: b.block_id, start: toMin(b.start), duration_min: Math.round(Number(b.duration_min)), title: String(b.title).trim(), kind: b.kind, core: b.core === true || ["apply", "prep", "outreach"].indexOf(b.kind) >= 0 };
      const parts = base.kind === "free" || base.kind === "meal" || base.kind === "rest" ? [base.title] : base.title.split(JOIN).map((x) => x.trim()).filter(Boolean);
      if (parts.length > 1) {
        const each = Math.max(10, Math.round(base.duration_min / parts.length));
        parts.forEach((p, i) => blocks.push(Object.assign({}, base, { block_id: i ? undefined : base.block_id, title: p[0].toUpperCase() + p.slice(1), start: base.start + i * each, duration_min: each })));
        notes.push("Split '" + base.title + "' into " + parts.length + " blocks (one block, one task).");
      } else blocks.push(base);
    });
    blocks.sort((a, b) => a.start - b.start);
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
    const covers = (w) => blocks.length && blocks[0].start < w.to && blocks.reduce((m, b) => Math.max(m, b.start + b.duration_min), 0) > w.from;
    MEALS.forEach((w) => {
      if (!covers(w) || blocks.some((b) => b.kind === "meal" && b.start < w.to && b.start + b.duration_min > w.from)) return;
      const free = blocks.find((b) => b.kind === "free" && b.start < w.to && b.start + b.duration_min > w.from);
      if (free) {                                                        // put the meal inside free time
        const at = Math.max(free.start, Math.min(w.at, free.start + free.duration_min - w.len));
        const after = free.start + free.duration_min - (at + w.len);
        const pre = at - free.start;
        blocks.splice(blocks.indexOf(free), 1);
        if (pre >= 5) blocks.push(Object.assign({}, free, { duration_min: pre }));
        blocks.push({ start: at, duration_min: w.len, title: w.name, kind: "meal", core: false });
        if (after >= 5) blocks.push(Object.assign({}, free, { block_id: undefined, start: at + w.len, duration_min: after }));
      } else {                                                           // insert and push later blocks
        const at = blocks.filter((b) => b.start + b.duration_min <= w.at).reduce((m, b) => Math.max(m, b.start + b.duration_min), blocks[0].start);
        blocks.forEach((b) => { if (b.start >= at && b.kind !== "free") b.start += w.len; });   // free time keeps its start
        blocks.push({ start: at, duration_min: w.len, title: w.name, kind: "meal", core: false });
      }
      notes.push("Added " + w.name.toLowerCase() + " at " + niceTime(hhmm(blocks.find((b) => b.title === w.name && b.kind === "meal").start)) + " (never skip a meal).");
      blocks.sort((a, b) => a.start - b.start);
    });
    blocks.sort((a, b) => a.start - b.start);
    for (let i = 1; i < blocks.length; i++) {                           // no overlaps: work moves later, free time is trimmed
      const prevEnd = blocks[i - 1].start + blocks[i - 1].duration_min;
      if (blocks[i].start >= prevEnd) continue;
      if (blocks[i].kind === "free") { const end = blocks[i].start + blocks[i].duration_min; blocks[i].start = prevEnd; blocks[i].duration_min = Math.max(0, end - prevEnd); }
      else blocks[i].start = prevEnd;
    }
    blocks = blocks.filter((b) => b.duration_min >= 5);
    return { blocks: blocks.map((b) => ({ block_id: b.block_id, start: hhmm(b.start), duration_min: b.duration_min, title: b.title, kind: b.kind, core: !!b.core })), notes };
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
.hvai-fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:75;display:flex;align-items:center;gap:8px;padding:6px 16px 6px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.7);
  background:linear-gradient(135deg,#4F66E0,#7C5CE0);color:#fff;font:700 15px/1 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 14px 34px -12px rgba(60,70,160,.8);cursor:pointer;-webkit-tap-highlight-color:transparent}
.hvai-fab svg{width:36px;height:36px;border-radius:11px;display:block}
.hvai-fab:active{transform:scale(.97)}
.hvai{position:fixed;z-index:76;right:16px;bottom:16px;width:min(430px,calc(100vw - 32px));height:min(680px,calc(100vh - 32px));display:flex;flex-direction:column;border-radius:26px;overflow:hidden;
  font:15px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--hvai-ink);background:var(--hvai-bg);border:1px solid var(--hvai-line);box-shadow:0 30px 80px -20px rgba(20,30,60,.45);
  -webkit-backdrop-filter:blur(24px) saturate(150%);backdrop-filter:blur(24px) saturate(150%);--hvai-ink:#16202E;--hvai-muted:#5A6479;--hvai-bg:rgba(248,249,255,.94);--hvai-card:#fff;--hvai-line:rgba(30,42,80,.12);--hvai-accent:#4F66E0;--hvai-danger:#C44E4E;--hvai-me:#E7EBFF}
.hvai.dark{--hvai-ink:#EEF1F7;--hvai-muted:#AAB3C5;--hvai-bg:rgba(18,22,40,.95);--hvai-card:rgba(255,255,255,.07);--hvai-line:rgba(255,255,255,.14);--hvai-accent:#8FA6FF;--hvai-danger:#F08A8A;--hvai-me:rgba(143,166,255,.18)}
.hvai[hidden],.hvai-fab[hidden]{display:none}
body:has(.kcard.dragging) .hvai-fab,body:has(.kcard-ghost) .hvai-fab{opacity:0;pointer-events:none}
.hvai-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--hvai-line)}
.hvai-head svg{width:30px;height:30px;border-radius:9px}
.hvai-head b{flex:1;font-size:17px}
.hvai-x{border:0;background:none;color:var(--hvai-muted);font-size:26px;line-height:1;padding:4px 8px;cursor:pointer}
.hvai-log{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.hvai-msg{max-width:88%;padding:9px 13px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word}
.hvai-msg.ai{align-self:flex-start;background:var(--hvai-card);border:1px solid var(--hvai-line);border-bottom-left-radius:6px}
.hvai-msg.me{align-self:flex-end;background:var(--hvai-me);border-bottom-right-radius:6px}
.hvai-msg.sys{align-self:center;font-size:13px;color:var(--hvai-muted);background:none;padding:2px 8px}
.hvai-card{align-self:stretch;border:1px solid var(--hvai-line);border-radius:18px;padding:11px 13px;background:var(--hvai-card)}
.hvai-card.danger{border-color:var(--hvai-danger)}
.hvai-card.done{opacity:.6}
.hvai-ct{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--hvai-muted);font-weight:700}
.hvai-card.danger .hvai-ct{color:var(--hvai-danger)}
.hvai-cx{font-weight:600;margin-top:2px}
.hvai-cs{font-size:13.5px;color:var(--hvai-muted);margin-top:2px}
.hvai-plan{margin:6px 0 0;padding-left:18px;font-size:13.5px}
.hvai-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
.hvai button.b{border-radius:999px;border:1px solid var(--hvai-line);background:transparent;color:var(--hvai-ink);padding:7px 14px;font:inherit;font-size:14px;cursor:pointer;min-height:36px}
.hvai button.b.p,.hvai a.b.p{background:var(--hvai-accent);border-color:transparent;color:#fff}
.hvai a.b{border-radius:999px;padding:7px 14px;font-size:14px;min-height:36px;box-sizing:border-box}
.hvai button.b.d{background:var(--hvai-danger);border-color:transparent;color:#fff}
.hvai-opt{display:block;width:100%;text-align:left;margin-top:6px}
.hvai-edit label{display:block;font-size:12.5px;color:var(--hvai-muted);margin:7px 0 2px}
.hvai-edit input,.hvai-edit select,.hvai-edit textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:8px 10px;border-radius:10px;border:1px solid var(--hvai-line);background:transparent;color:var(--hvai-ink)}
.hvai-bar{display:flex;align-items:flex-end;gap:8px;padding:10px 12px max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--hvai-line)}
.hvai-in{flex:1;resize:none;max-height:120px;min-height:44px;box-sizing:border-box;font:inherit;font-size:16px;padding:11px 14px;border-radius:22px;border:1px solid var(--hvai-line);background:var(--hvai-card);color:var(--hvai-ink)}
.hvai-mic,.hvai-send{flex:none;width:46px;height:46px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;font-size:19px;-webkit-tap-highlight-color:transparent;touch-action:none}
.hvai-mic{background:var(--hvai-card);border:1px solid var(--hvai-line);color:var(--hvai-ink)}
.hvai-mic.rec{background:var(--hvai-danger);color:#fff;border-color:transparent;animation:hvaiPulse 1s ease-in-out infinite}
.hvai-send{background:var(--hvai-accent);color:#fff}
.hvai-send:disabled{opacity:.45}
.hvai-typing{align-self:flex-start;color:var(--hvai-muted);font-size:13.5px;padding:2px 6px}
@keyframes hvaiPulse{50%{box-shadow:0 0 0 8px rgba(196,78,78,.2)}}
@media(max-width:640px){.hvai{right:0;left:0;bottom:0;width:100%;height:88vh;height:88dvh;border-radius:24px 24px 0 0}}
`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EDIT_FIELDS = {
    addJob: ["role", "company", "link", "source", "location", "stage", "notes"], updateJob: ["new_title", "link", "source", "location", "priority", "deadline", "notes"],
    moveStage: ["stage"], deleteJob: [], addFollowUp: ["title", "due_date", "type", "notes"], completeFollowUp: [],
    addEvent: ["title", "date", "time", "duration_min", "type", "notes"], buildDayPlan: ["blocks"], editDayPlan: ["blocks"],
  };
  const ENUMS = { stage: STAGES, priority: PRIORITIES, type: null };

  function mount(host) {
    if (typeof document === "undefined" || document.querySelector(".hvai-fab")) return null;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    const HKEY = "hvai-history-" + (host.app || "app");
    let history = []; try { history = JSON.parse(localStorage.getItem(HKEY) || "[]"); } catch (e) {}
    let lastUndo = null, busy = false;
    const fab = document.createElement("button"); fab.className = "hvai-fab"; fab.setAttribute("aria-label", "Open HV AI"); fab.innerHTML = (host.logoSVG || "") + "<span>HV AI</span>";
    const panel = document.createElement("section"); panel.className = "hvai"; panel.hidden = true; panel.setAttribute("aria-label", "HV AI");
    panel.innerHTML = '<div class="hvai-head">' + (host.logoSVG || "") + '<b>HV AI</b><button class="hvai-x" aria-label="Close HV AI">×</button></div>' +
      '<div class="hvai-log" role="log" aria-live="polite"></div>' +
      '<div class="hvai-bar"><button class="hvai-mic" aria-label="Hold to talk" title="Hold to talk">🎙</button><textarea class="hvai-in" rows="1" placeholder="Bolo ya likho… (Hindi / English / Hinglish)"></textarea><button class="hvai-send" aria-label="Send">➤</button></div>';
    if (host.fabCSS) { const x = document.createElement("style"); x.textContent = host.fabCSS; document.head.appendChild(x); }   // e.g. lift it above a sticky button bar
    document.body.appendChild(fab); document.body.appendChild(panel);
    const log = panel.querySelector(".hvai-log"), input = panel.querySelector(".hvai-in"), mic = panel.querySelector(".hvai-mic"), send = panel.querySelector(".hvai-send");
    const save = () => { try { localStorage.setItem(HKEY, JSON.stringify(history.slice(-60))); } catch (e) {} };
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const add = (cls, html) => { const el = document.createElement("div"); el.className = cls; el.innerHTML = html; log.appendChild(el); scroll(); return el; };
    const say = (who, text, keep) => { add("hvai-msg " + (who === "user" ? "me" : who === "sys" ? "sys" : "ai"), esc(text)); if (keep !== false && who !== "sys") { history.push({ role: who === "user" ? "user" : "ai", text }); save(); } };
    const firstName = () => String((host.userName && host.userName()) || "Harsh").split(" ")[0];
    const cfg = () => (host.getSettings && host.getSettings()) || {};
    const theme = () => panel.classList.toggle("dark", !!(host.isDark && host.isDark()));
    function open() {
      theme(); panel.hidden = false; fab.hidden = true;
      if (!log.childElementCount) {
        history.slice(-20).forEach((h) => add("hvai-msg " + (h.role === "user" ? "me" : "ai"), esc(h.text)));
        const c = cfg();
        if (!c.key || !c.provider || c.provider === "off") say("ai", host.keyHelp || "HV AI needs an AI key. Open HV Vault > Settings > AI, choose Gemini, paste your key (free from aistudio.google.com) and save. Then come back here.", false);
        else say("ai", "Bolo " + firstName() + ", kya karna hai?", false);
      }
      setTimeout(() => input.focus(), 50);
    }
    function close() { panel.hidden = true; fab.hidden = false; }
    fab.addEventListener("click", open); panel.querySelector(".hvai-x").addEventListener("click", close);
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(120, input.scrollHeight) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } });
    send.addEventListener("click", () => run());

    /* ---- cards ---- */
    function cardFor(res, batch) {
      const el = document.createElement("div"); el.className = "hvai-card"; log.appendChild(el);
      const item = { res, el, state: "pending" }; batch.items.push(item);
      paint(item, batch); scroll(); return item;
    }
    function paint(item, batch) {
      const r = item.res, el = item.el, data = host.getData ? host.getData() : null;
      el.className = "hvai-card";
      if (r.status === "choose") {
        el.innerHTML = '<div class="hvai-ct">' + esc(r.message) + '</div>' + r.options.map((o) => '<button class="b hvai-opt" data-id="' + esc(o.id) + '">' + esc(o.label) + '</button>').join("") + '<div class="hvai-row"><button class="b" data-a="cancel">Cancel</button></div>';
        el.querySelectorAll(".hvai-opt").forEach((b) => b.addEventListener("click", () => { item.res = choose(r, b.dataset.id); paint(item, batch); }));
      } else if (r.status === "handoff") {
        const d = describe(r.action, data);
        el.innerHTML = '<div class="hvai-ct">' + esc(d.icon + " " + d.title) + '</div><div class="hvai-cx">' + esc(d.text) + "</div>" + (d.sub ? '<div class="hvai-cs">' + esc(d.sub) + "</div>" : "") +
          (d.plan ? '<ol class="hvai-plan">' + d.plan.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : "") +
          '<div class="hvai-cs">Your day plan lives in Harsh Reset. Open it there to confirm.</div><div class="hvai-row"><a class="b p" style="text-decoration:none;display:inline-flex;align-items:center" href="' + esc(r.url) + '">Open in Harsh Reset</a><button class="b" data-a="cancel">Cancel</button></div>';
        item.state = "handoff";
      } else if (r.status === "notfound" || r.status === "invalid") {
        el.innerHTML = '<div class="hvai-ct">Can\'t do this one</div><div class="hvai-cs">' + esc(r.message) + '</div>'; item.state = "skipped";
      } else if (item.state === "edit") {
        const a = r.action.args, fields = EDIT_FIELDS[r.action.type] || [];
        el.innerHTML = '<div class="hvai-ct">Edit</div><div class="hvai-edit">' + fields.map((k) => {
          const v = k === "blocks" ? (a.blocks || []).map((b) => [b.start, b.duration_min, b.title, b.kind, b.core ? "core" : ""].join(" | ")).join("\n") : (a[k] == null ? "" : a[k]);
          const en = k === "type" ? (r.action.type === "addEvent" ? EVENT_TYPES : FU_TYPES) : ENUMS[k];
          const inp = k === "blocks" ? '<textarea rows="7" data-k="blocks">' + esc(v) + "</textarea>" : en ? '<select data-k="' + k + '"><option value=""></option>' + en.map((o) => "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select>" :
            '<input data-k="' + k + '" value="' + esc(v) + '"' + (/date|deadline/.test(k) ? ' type="date"' : k === "time" ? ' type="time"' : "") + ">";
          return "<label>" + esc(k === "blocks" ? "Blocks: start | minutes | title | kind | core" : k.replace("_", " ")) + "</label>" + inp;
        }).join("") + '</div><div class="hvai-row"><button class="b p" data-a="saveedit">Save</button><button class="b" data-a="canceledit">Back</button></div>';
      } else if (item.state === "done" || item.state === "cancelled") {
        const d = describe(r.action, data);
        el.className = "hvai-card done"; el.innerHTML = '<div class="hvai-ct">' + (item.state === "done" ? "Done · " : "Cancelled · ") + esc(d.title) + '</div><div class="hvai-cx">' + esc(d.text) + "</div>";
      } else {
        const d = describe(r.action, data);
        if (d.danger) el.className = "hvai-card danger";
        el.innerHTML = '<div class="hvai-ct">' + esc(d.icon + " " + d.title) + '</div><div class="hvai-cx">' + esc(d.text) + "</div>" + (d.sub ? '<div class="hvai-cs">' + esc(d.sub) + "</div>" : "") +
          (d.plan ? '<ol class="hvai-plan">' + d.plan.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : "") +
          '<div class="hvai-row"><button class="b ' + (d.danger ? "d" : "p") + '" data-a="confirm">' + (d.danger ? "Delete" : "Confirm") + '</button>' + ((EDIT_FIELDS[r.action.type] || []).length ? '<button class="b" data-a="edit">Edit</button>' : "") + '<button class="b" data-a="cancel">Cancel</button></div>';
      }
      el.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => act(item, batch, b.dataset.a)));
    }
    async function act(item, batch, a) {
      if (a === "cancel") { item.state = "cancelled"; paint(item, batch); return footer(batch); }
      if (a === "edit") { item.state = "edit"; return paint(item, batch); }
      if (a === "canceledit") { item.state = "pending"; return paint(item, batch); }
      if (a === "saveedit") {
        const args = Object.assign({}, item.res.action.args);
        item.el.querySelectorAll("[data-k]").forEach((f) => {
          const k = f.dataset.k, v = f.value.trim();
          if (k === "blocks") args.blocks = v.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p.length >= 3).map((p) => ({ start: p[0], duration_min: Number(p[1]), title: p[2], kind: BLOCK_KINDS.indexOf(p[3]) >= 0 ? p[3] : "work", core: /core/i.test(p[4] || "") }));
          else if (k === "duration_min") { if (v) args[k] = Number(v); else delete args[k]; }
          else if (v) args[k] = v; else delete args[k];
        });
        const next = prepare({ type: item.res.action.type, args }, host);
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
        batch.footer.querySelector('[data-a="none"]').addEventListener("click", () => { pending.forEach((i) => { i.state = "cancelled"; paint(i, batch); }); footer(batch); });
      }
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
    function prepare(action, h) {
      const data = h.getData ? h.getData() : null;
      if ((action.type === "buildDayPlan" || action.type === "editDayPlan") && validate(action).ok) {
        const cur = action.type === "editDayPlan" && h.getPlan ? (h.getPlan() || {}).blocks : null;
        const f = fixPlan(action.args.blocks, cur && cur.map((b) => ({ id: b.id, start: b.start, duration_min: b.duration_min, title: b.title, kind: b.kind, core: b.core, done: b.done })));
        action = { type: action.type, args: Object.assign({}, action.args, { blocks: f.blocks, notes: f.notes }) };
        if (!h.canPlan) return h.planHandoff ? { status: "handoff", action, url: h.planHandoff(action) } : { status: "notfound", action, message: "Day plans live in Harsh Reset. Open Reset and ask HV AI there." };
        const v = validate({ type: action.type, args: { date: action.args.date, blocks: action.args.blocks } });
        return v.ok ? { status: "ready", action } : { status: "invalid", action, message: v.errors.join("; ") };
      }
      return resolve(action, data, { today: istNow().date });
    }
    async function run(textIn) {
      const text = (textIn != null ? textIn : input.value).trim();
      if (!text || busy) return;
      input.value = ""; input.style.height = "auto";
      const c = cfg();
      say("user", text);
      if (!c.key || !c.provider || c.provider === "off") { say("ai", host.keyHelp || "Add your AI key in HV Vault > Settings > AI first.", false); return; }
      busy = true; send.disabled = true; const typing = add("hvai-typing", "HV AI is thinking…");
      let r;
      try { r = await interpret(c, text, host.getContext(), history.slice(0, -1)); } finally { typing.remove(); busy = false; send.disabled = false; }
      if (r.error) { say("sys", r.error === "NO_KEY" ? "Add your AI key in HV Vault > Settings > AI." : r.error, false); return; }
      const batch = { items: [] };
      const acts = (r.actions || []).slice(0, 12);
      acts.filter((a) => a.type === "answer" && a.args && str(a.args.text)).forEach((a) => say("ai", a.args.text));
      acts.filter((a) => a.type === "askClarification" && a.args && str(a.args.question)).forEach((a) => {
        say("ai", a.args.question);
        const opts = Array.isArray(a.args.options) ? a.args.options.filter(str).slice(0, 5) : [];
        if (opts.length) { const row = add("hvai-row", opts.map((o) => '<button class="b">' + esc(o) + "</button>").join("")); row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { row.remove(); run(b.textContent); })); }
      });
      acts.filter((a) => a.type !== "answer" && a.type !== "askClarification").forEach((a) => cardFor(prepare(a, host), batch));
      if (!acts.length) say("ai", "Samjha nahi. Thoda aur batao?", false);
      footer(batch);
    }

    /* ---- push-to-talk ---- */
    let rec = null, chunks = [], recStart = 0, speech = null;
    const canRecord = () => !!(root.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    async function micDown(e) {
      e.preventDefault(); if (busy) return;
      const c = cfg();
      if (!c.key || c.provider === "off" || !c.provider) { say("ai", host.keyHelp || "Add your AI key in HV Vault > Settings > AI first.", false); return; }
      if (c.provider === "gemini" && canRecord()) {
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
              else { input.value = t.text; input.dispatchEvent(new Event("input")); input.focus(); say("sys", "Check the text, fix anything, then tap ➤", false); }
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
        speech.onend = () => { mic.classList.remove("rec"); if (finalText) { input.dispatchEvent(new Event("input")); input.focus(); say("sys", "Check the text, fix anything, then tap ➤", false); } };
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
    return { open, close, run, showActions, setVisible: (v) => { if (!v) { panel.hidden = true; fab.hidden = true; } else if (panel.hidden) fab.hidden = false; }, refreshTheme: theme };
  }

  root.HVAI = { version: 1, STAGES, TOOLS, SYSTEM, istNow, addDays, dateHints, buildContext, validate, resolve, choose, fixPlan, describe, interpret, transcribe, mount };
})(typeof window !== "undefined" ? window : globalThis);
