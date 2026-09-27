/* Web bridge: stands in for electron/preload.cjs when HV Vault runs in a browser.
   Electron's preload defines window.storage before any script runs, so none of this
   runs inside the desktop app. In a browser it provides:
     window.storage   IndexedDB on this device, plus optional cloud sync (Google login)
     window.hv        AI calls from the browser, backup download/restore, cloud controls
   Cloud sync: every change is saved locally first, then pushed to the signed-in user's
   own Firestore space. Other devices pull changes every 15 seconds and on focus.
   Conflicts resolve per key, newest wins. A device joining an account never silently
   overwrites real data: if both sides have data, the user chooses. */
import "./hv-cloud.js";

const WEB_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "web"; // injected by vite.config.js

if (typeof window !== "undefined" && !window.storage) {
  const DB_NAME = "hv-vault", STORE = "kv";
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && "result" in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  const idbGet = (k) => tx("readonly", (s) => s.get(k));
  const idbPut = (k, v) => tx("readwrite", (s) => s.put(String(v), k));
  const idbDel = (k) => tx("readwrite", (s) => s.delete(k));
  const idbKeys = async () => ((await tx("readonly", (s) => s.getAllKeys())) || []).map(String);

  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  /* ---------------- cloud sync engine ---------------- */
  const MAIN = "jobhunthub-data-v1", MKEY = "hv-sync-meta";
  const localOnly = (k) => k.startsWith("hv-local-");
  const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + ":" + s.length; };
  let meta = (() => { try { return JSON.parse(localStorage.getItem(MKEY)) || { uid: null, keys: {} }; } catch (e) { return { uid: null, keys: {} }; } })();
  const saveMeta = () => { try { localStorage.setItem(MKEY, JSON.stringify(meta)); } catch (e) {} };
  const contentOf = (raw) => { try { const p = JSON.parse(raw); return (p.jobs || []).length + (p.companies || []).length + (p.followups || []).length + (p.resumes || []).length > 0 || !!p.profile; } catch (e) { return false; } };
  const docPath = (k) => "hv/" + encodeURIComponent(k);

  const Q = new Set(); let pushTimer = null, busy = false, pollTimer = null;
  const status = { state: "off", last: 0, error: "" };
  const statusSubs = new Set();
  const setStatus = (state, error) => { status.state = state; status.error = error || ""; if (state === "synced") status.last = Date.now(); statusSubs.forEach((cb) => { try { cb({ ...status }); } catch (e) {} }); };
  const C = () => window.HVCloud;
  const linked = () => C() && C().user && meta.uid === C().user.uid;

  async function getManifest() { const g = await C().getValue("meta/hv"); try { return g ? JSON.parse(g.value) || {} : {}; } catch (e) { return {}; } }
  async function putManifest(changes) {
    const latest = await getManifest();                       // merge so two devices never erase each other
    for (const [k, v] of Object.entries(changes)) if (!latest[k] || v.t >= latest[k].t) latest[k] = v;
    await C().putValue("meta/hv", JSON.stringify(latest), Date.now(), 0);
  }
  function schedulePush(k) { if (k) Q.add(k); clearTimeout(pushTimer); pushTimer = setTimeout(flush, 800); }
  async function flush() {
    if (!linked() || !Q.size) return;
    if (busy) { schedulePush(); return; }
    busy = true; setStatus("syncing");
    const keys = [...Q]; Q.clear();
    try {
      const remote = await getManifest(), changes = {};
      for (const k of keys) {
        const m = meta.keys[k]; if (!m) continue;
        const r = remote[k];
        if (r && r.t > m.t) continue;                           // remote is newer; pull takes it
        if (m.del) { await C().delValue(docPath(k)); changes[k] = { t: m.t, del: true }; m.p = 0; }
        else {
          const v = await idbGet(k); if (v === undefined) continue;
          m.p = await C().putValue(docPath(k), v, m.t, (r && r.p) || m.p || 0);
          changes[k] = { t: m.t, p: m.p };
        }
      }
      if (Object.keys(changes).length) await putManifest(changes);
      saveMeta(); setStatus("synced");
    } catch (e) { keys.forEach((k) => Q.add(k)); setStatus("error", e.message); }
    finally { busy = false; }
  }
  async function pull() {
    if (!linked() || busy) return;
    busy = true; setStatus("syncing");
    let changed = 0, main = false;
    try {
      const remote = await getManifest();
      for (const [k, r] of Object.entries(remote)) {
        if (localOnly(k)) continue;
        const m = meta.keys[k];
        if (r.t > (m ? m.t : 0)) {
          if (r.del) { await idbDel(k); meta.keys[k] = { t: r.t, del: true, p: 0 }; }
          else {
            const got = await C().getValue(docPath(k)); if (!got) continue;
            await idbPut(k, got.value); meta.keys[k] = { t: r.t, h: hash(got.value), p: r.p || 0 };
          }
          changed++; if (k === MAIN) main = true;
        }
      }
      for (const [k, m] of Object.entries(meta.keys)) { const r = remote[k]; if (!r || m.t > r.t) Q.add(k); }
      saveMeta(); setStatus("synced");
    } catch (e) { setStatus("error", e.message); }
    finally { busy = false; }
    if (Q.size) schedulePush();
    if (changed) window.dispatchEvent(new CustomEvent("hv-remote-update", { detail: { main } }));
  }
  async function join(u) {
    setStatus("syncing");
    const remote = await getManifest();
    const rMain = remote[MAIN] && !remote[MAIN].del ? await C().getValue(docPath(MAIN)) : null;
    const remoteHas = !!(rMain && contentOf(rMain.value));
    const localMain = await idbGet(MAIN);
    const localHas = !!(localMain && contentOf(localMain));
    let adopt = remoteHas && !localHas;
    if (remoteHas && localHas) {
      adopt = window.confirm("HV Vault sync: this device and your cloud account both have data.\n\n" +
        "OK = use the cloud data on this device (this device's current data is kept as a backup).\n" +
        "Cancel = replace the cloud with this device's data.");
    }
    if (adopt) {
      if (localHas) { try { localStorage.setItem("hv-local-backup", localMain); } catch (e) {} }
      meta = { uid: u.uid, keys: {} }; saveMeta();
      busy = false; await pull();
    } else {
      const now = Date.now(); meta = { uid: u.uid, keys: {} };
      for (const k of (await idbKeys()).filter((k) => !localOnly(k))) {
        const v = await idbGet(k); meta.keys[k] = { t: now, h: hash(v), p: (remote[k] && remote[k].p) || 0 }; Q.add(k);
      }
      for (const [k, r] of Object.entries(remote)) if (!meta.keys[k] && !r.del) { meta.keys[k] = { t: now, del: true, p: r.p || 0 }; Q.add(k); }
      saveMeta(); await flush();
    }
    try { if (await C().req("GET", "apps/reset")) localStorage.setItem("hv-reset-linked", "1"); } catch (e) {}
  }
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) pull(); }, 15000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  window.addEventListener("focus", () => pull());
  if (C()) C().onChange(async (u) => {
    if (!u) { clearInterval(pollTimer); setStatus("off"); return; }
    try { if (meta.uid === u.uid) await pull(); else await join(u); startPolling(); }
    catch (e) { setStatus("error", e.message); }
  });

  window.storage = {
    async get(key) {
      const v = await idbGet(key);
      if (v === undefined) throw new Error("Key not found: " + key);
      return { key, value: v };
    },
    async set(key, value) {
      const v = String(value);
      await idbPut(key, v);
      if (!localOnly(key)) {
        const h = hash(v), m = meta.keys[key];
        if (!m || m.h !== h || m.del) { meta.keys[key] = { t: Date.now(), h, p: (m && m.p) || 0 }; saveMeta(); schedulePush(key); }
      }
      return { key, value };
    },
    async delete(key) {
      await idbDel(key);
      if (!localOnly(key)) { const m = meta.keys[key]; meta.keys[key] = { t: Date.now(), del: true, p: (m && m.p) || 0 }; saveMeta(); schedulePush(key); }
      return { key, deleted: true };
    },
    async list(prefix = "") { return { keys: (await idbKeys()).filter((k) => !prefix || k.startsWith(prefix)) }; },
  };

  const cloudApi = {
    get configured() { return !!(C() && C().configured); },
    get user() { return C() ? C().user : null; },
    status: () => ({ ...status }),
    onStatus(cb) { statusSubs.add(cb); return () => statusSubs.delete(cb); },
    onUser(cb) { return C() ? C().onChange(cb) : () => {}; },
    signIn: () => C().signIn(),
    signOut: () => C().signOut(),
    syncNow: async () => { await pull(); await flush(); },
  };

  /* ---- AI: same logic as electron/main.cjs, run directly in the browser ---- */
  const handlers = {};
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  /* ---------- Shared AI helpers ---------- */
  const friendly = (status, bodyErr) => {
    if (status === 401 || status === 403) return "API key invalid or unauthorized — re-check the key in Settings";
    if (status === 429) return "Rate limit reached — wait a minute, or check your provider quota/billing";
    if (status === 404) return "Model not found — clear the Model field in Settings to use the default";
    if (status >= 500) return "Provider server error — try again in a few minutes";
    return bodyErr || ("Request failed (HTTP " + status + ")");
  };
  const fetchWithTimeout = async (url, opts) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
  };

  /* ---------- IPC: optional AI resume parsing ---------- */
  /* Key user ke apne settings se aati hai (unke PC par saved). Call unke chosen provider ko jaati hai. */
  ipcMain.handle("hv:aiParse", async (_e, { provider, apiKey, model, text }) => {
    try {
      if (!apiKey) return { error: "No API key set in Settings" };
      if (!text || !String(text).trim()) return { error: "No resume text to parse" };
      const prompt =
        "Extract structured data from this resume text. Respond with ONLY a valid JSON object, " +
        "no markdown fences, no commentary, using exactly these keys (all string values; empty string if not found): " +
        "name, email, phone, linkedin, portfolio, location, target_role, skills, education, experience, projects, summary. " +
        "'target_role' is the person's current or target role/headline. 'projects' should also include certifications. " +
        "'skills' must be a comma-separated string. Keep education/experience/projects as readable multi-line text.\n\n" +
        "RESUME TEXT:\n" + String(text).slice(0, 20000);

      let out = "";
      if (provider === "gemini") {
        const m = (model || "gemini-2.5-flash").trim();
        const res = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent?key=" + encodeURIComponent(apiKey),
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
        let j = {};
        try { j = await res.json(); } catch (e) {}
        if (!res.ok || j.error) return { error: friendly(res.status, j.error && j.error.message) };
        out = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
          ? j.candidates[0].content.parts.map((p) => p.text || "").join("") : "");
      } else if (provider === "openrouter") {
        const m = (model || "google/gemini-2.0-flash-001").trim();
        const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({ model: m, messages: [{ role: "user", content: prompt }] }),
        });
        let j = {};
        try { j = await res.json(); } catch (e) {}
        if (!res.ok || j.error) return { error: friendly(res.status, j.error && (j.error.message || String(j.error))) };
        out = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      } else {
        return { error: "AI provider is set to Off" };
      }

      const clean = String(out).replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
      if (a === -1 || b === -1) return { error: "AI reply was not in the expected format — try again or use the local parse" };
      let data;
      try { data = JSON.parse(clean.slice(a, b + 1)); }
      catch (e) { return { error: "AI reply could not be read — try again or use the local parse" }; }
      return { ok: true, data };
    } catch (e) {
      if (e && e.name === "AbortError") return { error: "AI request timed out (45s) — check your internet and try again" };
      if (e && /fetch failed|ENOTFOUND|ECONN/i.test(e.message || "")) return { error: "Could not reach the AI provider — check your internet connection" };
      return { error: e.message };
    }
  });

  /* ---------- IPC: generic AI extraction (job / company / profile, text or image) ---------- */
  ipcMain.handle("hv:aiExtract", async (_e, { provider, apiKey, model, kind, text, imageBase64, imageMime }) => {
    try {
      if (!apiKey) return { error: "No API key set in Settings" };
      if ((!text || !String(text).trim()) && !imageBase64) return { error: "Nothing to analyze — paste text or add an image first" };

      const PROMPTS = {
        job: "Extract job posting details using exactly these keys: company_name, job_title, location, salary_range, " +
          "work_mode (exactly one of: Remote, Hybrid, On-site — or empty string), " +
          "job_type (exactly one of: Full-time, Part-time, Internship, Contract, Freelance — or empty string), " +
          "experience_required, skills_required (comma-separated string), job_link, deadline (YYYY-MM-DD or empty), " +
          "description (2-3 line summary of the role).",
        company: "Extract company details using exactly these keys: name, industry, location, website, career_page, " +
          "size (e.g. 51-200), notes (one line describing what the company does).",
        profile: "Extract resume/profile details using exactly these keys: name, email, phone, linkedin, portfolio, location, " +
          "target_role, total_experience (human-readable, e.g. '1 year 3 months'), skills (comma-separated string), summary, " +
          "education, projects (include certifications), experience (readable multi-line text of all roles), " +
          "work_experience (ARRAY of objects with keys company, role, duration — full-time jobs only), " +
          "internships (ARRAY of objects with keys company, role, duration).",
      };
      const prompt =
        "You extract structured data. Respond with ONLY a valid JSON object — no markdown fences, no commentary. " +
        "Missing values must be empty strings (or empty arrays for array keys). " +
        (PROMPTS[kind] || PROMPTS.job) +
        (text && String(text).trim() ? "\n\nTEXT:\n" + String(text).slice(0, 20000) : "\n\nRead the details from the attached image.");

      let out = "";
      if (provider === "gemini") {
        const m = (model || "gemini-2.5-flash").trim();
        const parts = [{ text: prompt }];
        if (imageBase64) parts.push({ inline_data: { mime_type: imageMime || "image/png", data: imageBase64 } });
        const res = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent?key=" + encodeURIComponent(apiKey),
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }) }
        );
        let j = {};
        try { j = await res.json(); } catch (e) {}
        if (!res.ok || j.error) return { error: friendly(res.status, j.error && j.error.message) };
        out = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
          ? j.candidates[0].content.parts.map((p) => p.text || "").join("") : "");
      } else if (provider === "openrouter") {
        const m = (model || "google/gemini-2.0-flash-001").trim();
        const content = imageBase64
          ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:" + (imageMime || "image/png") + ";base64," + imageBase64 } }]
          : prompt;
        const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({ model: m, messages: [{ role: "user", content }] }),
        });
        let j = {};
        try { j = await res.json(); } catch (e) {}
        if (!res.ok || j.error) return { error: friendly(res.status, j.error && (j.error.message || String(j.error))) };
        out = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      } else return { error: "AI provider is set to Off" };

      const clean = String(out).replace(/```json|```/g, "").trim();
      const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
      if (a === -1 || b === -1) return { error: "AI reply was not in the expected format — try again" };
      let data;
      try { data = JSON.parse(clean.slice(a, b + 1)); }
      catch (e) { return { error: "AI reply could not be read — try again" }; }
      return { ok: true, data };
    } catch (e) {
      if (e && e.name === "AbortError") return { error: "AI request timed out (45s) — check your internet and try again" };
      if (e && /fetch failed|ENOTFOUND|ECONN/i.test(e.message || "")) return { error: "Could not reach the AI provider — check your internet connection" };
      return { error: e.message };
    }
  });

  /* ---------- IPC: test AI connection (used by setup wizard & Settings) ---------- */
  ipcMain.handle("hv:aiTest", async (_e, { provider, apiKey, model }) => {
    try {
      if (!apiKey) return { error: "Please paste an API key first" };
      const tiny = "Reply with exactly: OK";
      let res, j = {};
      if (provider === "gemini") {
        const m = (model || "gemini-2.5-flash").trim();
        res = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent?key=" + encodeURIComponent(apiKey),
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: tiny }] }] }) }
        );
      } else if (provider === "openrouter") {
        const m = (model || "google/gemini-2.0-flash-001").trim();
        res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({ model: m, messages: [{ role: "user", content: tiny }] }),
        });
      } else return { error: "Choose a provider first" };
      try { j = await res.json(); } catch (e) {}
      if (!res.ok || j.error) return { error: friendly(res.status, j.error && (j.error.message || String(j.error))) };
      return { ok: true };
    } catch (e) {
      if (e && e.name === "AbortError") return { error: "Request timed out — check your internet" };
      if (e && /fetch failed|ENOTFOUND|ECONN/i.test(e.message || "")) return { error: "Could not reach the provider — check your internet connection" };
      return { error: e.message };
    }
  });
  const call = (ch) => (payload) => handlers[ch](null, payload || {});

  const pickFile = () => new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = () => resolve(inp.files && inp.files[0]);
    inp.click();
  });

  window.hv = {
    isDesktop: false,
    isWeb: true,
    cloud: cloudApi,
    aiParse: call("hv:aiParse"),
    aiExtract: call("hv:aiExtract"),
    aiTest: call("hv:aiTest"),
    getAppVersion: async () => WEB_VERSION,
    // The web version is always the latest deploy; there is nothing to download.
    checkForUpdates: async () => ({ web: true }),
    downloadUpdate: async () => ({ error: "Not needed on the web version" }),
    installUpdate: async () => ({ error: "Not needed on the web version" }),
    onUpdateStatus: () => () => {},
    async exportBackup() {
      try {
        const { keys } = await window.storage.list("");
        const entries = {};
        for (const k of keys) { try { entries[k] = (await window.storage.get(k)).value; } catch (e) {} }
        const name = "hv-vault-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        const blob = new Blob([JSON.stringify({ app: "hv-vault", version: 1, exportedAt: new Date().toISOString(), entries }, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        return { path: name };
      } catch (e) { return { error: e.message }; }
    },
    async importBackup() {
      const f = await pickFile();
      if (!f) return { canceled: true };
      try {
        const raw = JSON.parse(await f.text());
        const entries = raw.entries || raw;
        let count = 0;
        for (const [k, v] of Object.entries(entries)) {
          if (typeof v === "string") { await window.storage.set(k, v); count++; }
        }
        return { count };
      } catch (e) { return { error: e.message }; }
    },
  };
}
