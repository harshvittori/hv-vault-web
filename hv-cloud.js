/* HVCloud: shared by HV Vault web and HV Reset.
   Google login (Firebase Auth) + per-user storage in Firestore.
   Every document lives under users/{uid}/..., and the security rules only let a
   signed-in user read or write their own uid. Both apps run on the same site
   (harshvittori.github.io), so signing in to one signs in to the other.
   Config comes from firebase-config.js (window.HV_FIREBASE_CONFIG).
   HV Reset loads this same file (../hv-vault-web/hv-cloud.js).
   It also carries the site's built-in AI (gemini): Firebase AI Logic on this project,
   protected by App Check, so HV AI works for everyone without a personal key. */
(function () {
  if (typeof window === "undefined" || window.HVCloud) return;
  if (window.storage && window.hv && window.hv.isDesktop !== false) return;   // Electron desktop app: never touch the cloud
  const T = window.__HV_TEST_CLOUD || null;          // test harness only
  const cfg = window.HV_FIREBASE_CONFIG || null;
  const configured = !!(T || (cfg && cfg.apiKey && cfg.projectId && !/PASTE/.test(cfg.apiKey)));
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const CHUNK = 900000;                               // Firestore doc limit is 1 MiB
  const subs = new Set();
  let auth = null, appCheck = null, user = null, readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  const emit = () => subs.forEach((cb) => { try { cb(user); } catch (e) {} });
  const setUser = (u) => { user = u ? { uid: u.uid, email: u.email || "", name: u.displayName || "" } : null; emit(); readyResolve(); };

  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });

  async function init() {
    if (!configured) { readyResolve(); return; }
    if (T) { T.auth.onChange(setUser); return; }
    try {
      if (!window.firebase) { await load(SDK + "firebase-app-compat.js"); await load(SDK + "firebase-auth-compat.js"); }
      if (cfg.appCheckSiteKey && !window.firebase.appCheck) await load(SDK + "firebase-app-check-compat.js");
      if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
      // App Check (reCAPTCHA) proves requests come from this site; it must start before other services.
      if (cfg.appCheckSiteKey && window.firebase.appCheck) {
        try {
          appCheck = window.firebase.appCheck();
          appCheck.activate(cfg.appCheckProvider === "enterprise" ? new window.firebase.appCheck.ReCaptchaEnterpriseProvider(cfg.appCheckSiteKey) : cfg.appCheckSiteKey, true);
        } catch (e) { appCheck = null; }
      }
      auth = window.firebase.auth();
      auth.onAuthStateChanged(setUser);
    } catch (e) { readyResolve(); }
  }

  const base = () => (T ? T.base : "https://firestore.googleapis.com/v1/projects/" + cfg.projectId + "/databases/(default)/documents");
  const url = (path) => base() + "/users/" + user.uid + "/" + path;
  async function token() {
    if (T) return T.auth.token();
    return auth.currentUser ? auth.currentUser.getIdToken() : null;
  }
  async function appCheckToken() {
    if (!appCheck) return null;
    try { const r = await appCheck.getToken(false); return (r && r.token) || null; } catch (e) { return null; }
  }
  async function req(method, path, body) {
    if (!user) throw new Error("Not signed in");
    const t = await token(), ac = await appCheckToken();
    const r = await fetch(url(path), {
      method, cache: "no-store",
      headers: Object.assign({ Authorization: "Bearer " + t }, ac ? { "X-Firebase-AppCheck": ac } : {}, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Cloud error " + r.status);
    return method === "DELETE" ? true : r.json();
  }
  /* ---------- built-in AI (Firebase AI Logic, Gemini Developer API) ----------
     Any Gemini generateContent body; a missing model (404) falls through to the next one. */
  const AI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
  const aiOn = () => !!(cfg && cfg.apiKey && cfg.projectId && !/PASTE/.test(cfg.apiKey));
  function aiError(status, msg, hadAppCheck) {
    if (status === 403 && /disabled|not been used/i.test(msg)) return "AI isn't switched on for this site yet";
    if (status === 401 && /app check/i.test(msg)) return hadAppCheck ? "Couldn't verify this browser for AI. Reload the page, or turn off ad or tracker blockers" : "AI on this site needs App Check, which isn't set up here";
    if (status === 429) return "HV AI is busy right now. Try again in a minute";
    if (!status) return msg || "Couldn't reach the AI. Check your internet";
    return "AI error (" + (msg || "HTTP " + status) + ")";
  }
  async function gemini(body, opts) {
    const o = opts || {};
    if (!aiOn()) return { ok: false, status: 0, json: {}, error: "AI isn't set up for this site" };
    const ac = await appCheckToken();
    let last = { status: 0, message: "", json: {} };
    for (const m of o.models || AI_MODELS) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), o.timeout || 45000);
      let res, j = {};
      try {
        res = await fetch("https://firebasevertexai.googleapis.com/v1beta/projects/" + encodeURIComponent(cfg.projectId) + "/models/" + m + ":generateContent", {
          method: "POST", signal: ctrl.signal,
          headers: Object.assign({ "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey }, ac ? { "X-Firebase-AppCheck": ac } : {}),
          body: JSON.stringify(body),
        });
        try { j = await res.json(); } catch (e) {}
      } catch (e) {
        return { ok: false, status: 0, json: {}, error: e && e.name === "AbortError" ? "AI took too long. Try again" : "Couldn't reach the AI. Check your internet" };
      } finally { clearTimeout(timer); }
      if (res.ok && !j.error) return { ok: true, status: res.status, json: j, model: m };
      last = { status: res.status, message: (j.error && j.error.message) || "", json: j };
      if (res.status !== 404) break;
    }
    return { ok: false, status: last.status, json: last.json, message: last.message, disabled: last.status === 403 && /disabled|not been used/i.test(last.message), error: aiError(last.status, last.message, !!ac) };
  }
  const aiText = (j) => { const c = j && j.candidates && j.candidates[0]; return c && c.content && c.content.parts ? c.content.parts.map((x) => x.text || "").join("") : ""; };

  const str = (d, k) => (d && d.fields && d.fields[k] ? d.fields[k].stringValue || "" : "");
  const num = (d, k) => (d && d.fields && d.fields[k] ? Number(d.fields[k].integerValue || 0) : 0);

  // Store a string of any size: small values in one doc, large ones split into chunk docs.
  async function putValue(path, value, t, prevParts) {
    const v = String(value);
    const n = v.length <= CHUNK ? 0 : Math.ceil(v.length / CHUNK);
    if (!n) {
      await req("PATCH", path, { fields: { v: { stringValue: v }, t: { integerValue: String(t) }, parts: { integerValue: "0" } } });
    } else {
      for (let i = 0; i < n; i++) await req("PATCH", path + "~" + i, { fields: { v: { stringValue: v.slice(i * CHUNK, (i + 1) * CHUNK) } } });
      await req("PATCH", path, { fields: { t: { integerValue: String(t) }, parts: { integerValue: String(n) } } });
    }
    for (let i = n; i < (prevParts || 0); i++) await req("DELETE", path + "~" + i);   // stale chunks from a bigger old value
    return n;
  }
  async function getValue(path) {
    const d = await req("GET", path);
    if (!d) return null;
    const parts = num(d, "parts"), t = num(d, "t");
    if (!parts) return { value: str(d, "v"), t };
    let out = "";
    for (let i = 0; i < parts; i++) { const c = await req("GET", path + "~" + i); if (!c) return null; out += str(c, "v"); }
    return { value: out, t };
  }
  async function delValue(path) {
    const d = await req("GET", path);
    const parts = d ? num(d, "parts") : 0;
    for (let i = 0; i < parts; i++) await req("DELETE", path + "~" + i);
    if (d) await req("DELETE", path);
  }

  window.HVCloud = {
    configured, ready,
    get user() { return user; },
    onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
    async signIn() {
      if (!configured) throw new Error("Cloud sync is not set up yet (firebase-config.js)");
      if (T) return T.auth.signIn();
      if (!auth) await init();
      const p = new window.firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      // Popup only. The site (github.io) and the auth helper (firebaseapp.com) are different
      // domains, so signInWithRedirect breaks on phones that partition storage ("missing initial
      // state"). See firebase.google.com/docs/auth/web/redirect-best-practices, option 2.
      await auth.signInWithPopup(p);
    },
    async signOut() { if (T) return T.auth.signOut(); if (auth) await auth.signOut(); },
    req, str, num, putValue, getValue, delValue, appCheckToken,
    gemini, aiText, get aiOn() { return aiOn(); },
    get appCheckOn() { return !!appCheck; },
  };
  init();
})();
