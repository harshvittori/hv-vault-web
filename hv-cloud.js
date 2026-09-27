/* HVCloud: shared by HV Vault web and Harsh Reset.
   Google login (Firebase Auth) + per-user storage in Firestore.
   Every document lives under users/{uid}/..., and the security rules only let a
   signed-in user read or write their own uid. Both apps run on the same site
   (harshvittori.github.io), so signing in to one signs in to the other.
   Config comes from firebase-config.js (window.HV_FIREBASE_CONFIG).
   This exact code is also inlined in harsh-reset/index.html: keep both copies identical. */
(function () {
  if (typeof window === "undefined" || window.HVCloud) return;
  if (window.storage && window.hv && window.hv.isDesktop !== false) return;   // Electron desktop app: never touch the cloud
  const T = window.__HV_TEST_CLOUD || null;          // test harness only
  const cfg = window.HV_FIREBASE_CONFIG || null;
  const configured = !!(T || (cfg && cfg.apiKey && cfg.projectId && !/PASTE/.test(cfg.apiKey)));
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const CHUNK = 900000;                               // Firestore doc limit is 1 MiB
  const subs = new Set();
  let auth = null, user = null, readyResolve;
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
      if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
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
  async function req(method, path, body) {
    if (!user) throw new Error("Not signed in");
    const t = await token();
    const r = await fetch(url(path), {
      method, cache: "no-store",
      headers: Object.assign({ Authorization: "Bearer " + t }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Cloud error " + r.status);
    return method === "DELETE" ? true : r.json();
  }
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
      try { await auth.signInWithPopup(p); }
      catch (e) {
        if (/popup-blocked|operation-not-supported|popup-closed-by-browser/.test(e.code || "")) return auth.signInWithRedirect(p);
        throw e;
      }
    },
    async signOut() { if (T) return T.auth.signOut(); if (auth) await auth.signOut(); },
    req, str, num, putValue, getValue, delValue,
  };
  init();
})();
