/* Web only: HV Vault opens after Google sign-in, and only once that account's data has
   been loaded onto this device. The data lives in the Google account (Firestore); the
   browser just keeps a cache. Desktop (Electron) and unconfigured builds skip the gate. */
import React, { useEffect, useState } from "react";

const CSS = `
.hv-gate{--bg:#F6F7FA;--card:#FFFFFF;--line:#E6EAF1;--text:#28313F;--slate:#5C6779;--accent:#5B7CC4;--accent-deep:#47649F;--err:#B4443A;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--text);
  font-family:'Inter',system-ui,sans-serif;font-size:15.5px;line-height:1.55}
@media (prefers-color-scheme:dark){.hv-gate{--bg:#14171E;--card:#1E232E;--line:#333B4A;--text:#F1F3F8;--slate:#C2CAD8;--accent:#8FA9E0;--accent-deep:#6E8FD4;--err:#F08A80}}
.hv-gate-card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px 28px;text-align:center;box-shadow:0 10px 30px rgba(20,30,50,.06)}
.hv-gate h1{font-family:'Sora','Inter',sans-serif;font-size:24px;margin:12px 0 4px}
.hv-gate p{margin:0 0 18px;color:var(--slate)}
.hv-gate img{width:56px;height:56px;border-radius:14px}
.hv-gate-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px 16px;border-radius:10px;border:0;
  background:var(--accent);color:#fff;font:600 15px 'Inter',system-ui,sans-serif;cursor:pointer}
.hv-gate-btn:hover{background:var(--accent-deep)}
.hv-gate-btn:disabled{opacity:.6;cursor:default}
.hv-gate-link{margin-top:12px;background:none;border:0;color:var(--slate);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}
.hv-gate-err{color:var(--err);font-size:14px;margin:0 0 14px}
.hv-gate-small{font-size:13px;margin:16px 0 0}
`;

const G = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const friendly = (e) => {
  const c = (e && e.code) || "";
  if (/popup-closed-by-user|cancelled-popup-request/.test(c)) return "";
  if (/unauthorized-domain/.test(c)) return "This website isn't allowed to use Google sign-in yet (Firebase > Authentication > Authorized domains).";
  if (/network-request-failed/.test(c)) return "No internet connection. Check it and try again.";
  return "Sign-in failed: " + ((e && e.message) || e);
};

export default function AuthGate({ children }) {
  const cloud = typeof window !== "undefined" && window.hv && window.hv.cloud;
  const gated = !!(cloud && cloud.configured);
  const [known, setKnown] = useState(false);
  const [user, setUser] = useState(gated ? cloud.user : null);
  const [st, setSt] = useState(gated ? cloud.status() : {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!gated) return;
    cloud.authReady().then(() => { setUser(cloud.user); setKnown(true); });
    const a = cloud.onUser((u) => setUser(u)), b = cloud.onStatus(setSt);
    return () => { a(); b(); };
  }, []);

  if (!gated || (user && st.ready)) return children;

  const icon = typeof document !== "undefined" && document.querySelector('link[rel="icon"]');
  const signIn = async () => {
    setErr(""); setBusy(true);
    try { await cloud.signIn(); } catch (e) { setErr(friendly(e)); }
    setBusy(false);
  };

  let body;
  if (!known) body = <p>Loading…</p>;
  else if (!user) body = (
    <>
      <p>Sign in with your Google account. Your jobs, companies and resumes are saved to it, so you see the same data on your phone and laptop.</p>
      {err && <p className="hv-gate-err">{err}</p>}
      <button className="hv-gate-btn" onClick={signIn} disabled={busy}>{G}{busy ? "Signing in…" : "Continue with Google"}</button>
      <p className="hv-gate-small">Only you can see your data.</p>
    </>
  );
  else if (st.state === "error") body = (
    <>
      <p>Signed in as <strong>{user.email || user.name}</strong>, but your data couldn't be loaded.</p>
      <p className="hv-gate-err">{st.error}</p>
      <button className="hv-gate-btn" onClick={() => cloud.retry()}>Try again</button>
      <button className="hv-gate-link" onClick={() => cloud.signOut()}>Use a different account</button>
    </>
  );
  else body = <p>Loading your data for <strong>{user.email || user.name}</strong>…</p>;

  return (
    <div className="hv-gate">
      <style>{CSS}</style>
      <div className="hv-gate-card">
        {icon && <img src={icon.href} alt="" />}
        <h1>HV Vault</h1>
        {body}
      </div>
    </div>
  );
}
