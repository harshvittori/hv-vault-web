/* Web only. Anyone can use HV Vault without an account (guest: nothing is saved, see
   web-bridge.js). After Google sign-in, the app opens once that account's data has been
   loaded onto this device. The data lives in the Google account (Firestore); the browser
   just keeps a cache. Desktop (Electron) and unconfigured builds skip this. */
import React, { useEffect, useState } from "react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@200;300;500;600&family=Atkinson+Hyperlegible:wght@400;700&display=swap');
.hv-gate{--sky1:#D9E3F4;--sky2:#E9E1F1;--sky3:#F8E4D2;--orb1:#A9BCEB;--orb2:#F6C79A;--card:rgba(255,255,255,.56);--border:rgba(255,255,255,.8);--hi:rgba(255,255,255,.95);
  --text:#16202E;--slate:#46516A;--err:#B4443A;
  position:relative;overflow:hidden;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;
  background:linear-gradient(180deg,var(--sky1) 0%,var(--sky2) 56%,var(--sky3) 100%);color:var(--text);
  font-family:'Atkinson Hyperlegible','Inter',system-ui,sans-serif;font-size:15.5px;line-height:1.55}
@media (prefers-color-scheme:dark){.hv-gate{--sky1:#070C1A;--sky2:#141A38;--sky3:#2E2342;--orb1:#3346A0;--orb2:#9A6440;--card:rgba(255,255,255,.07);--border:rgba(255,255,255,.14);--hi:rgba(255,255,255,.18);--text:#EEF1F7;--slate:#C3CADB;--err:#F08A80}}
.hv-gate::before,.hv-gate::after{content:"";position:absolute;border-radius:50%;pointer-events:none}
.hv-gate::before{width:80vmax;height:80vmax;left:-30vmax;top:-40vmax;background:radial-gradient(circle,var(--orb1) 0%,transparent 68%);opacity:.8}
.hv-gate::after{width:70vmax;height:70vmax;right:-28vmax;bottom:-38vmax;background:radial-gradient(circle,var(--orb2) 0%,transparent 68%);opacity:.75}
.hv-gate-card{position:relative;z-index:1;width:100%;max-width:420px;background:var(--card);border:1px solid var(--border);border-radius:30px;padding:38px 30px;text-align:center;
  box-shadow:0 30px 80px -24px rgba(40,50,80,.38),inset 0 1px 0 var(--hi);-webkit-backdrop-filter:blur(30px) saturate(165%);backdrop-filter:blur(30px) saturate(165%)}
.hv-gate h1{font-family:'Sora',sans-serif;font-weight:300;font-size:34px;letter-spacing:-.03em;margin:14px 0 6px}
.hv-gate p{margin:0 0 20px;color:var(--slate)}
.hv-gate img{width:60px;height:60px;border-radius:16px;box-shadow:0 12px 28px -12px rgba(40,50,90,.6)}
.hv-gate-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 18px;border-radius:999px;border:0;
  background:linear-gradient(135deg,#4F66E0 0%,#7C5CE0 100%);color:#fff;font:700 15.5px 'Atkinson Hyperlegible',system-ui,sans-serif;cursor:pointer;
  box-shadow:0 12px 28px -10px rgba(79,102,224,.85),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .3s cubic-bezier(.22,1,.36,1)}
.hv-gate-btn:hover{transform:translateY(-1px)}
.hv-gate-btn:disabled{opacity:.6;cursor:default;transform:none}
.hv-gate-btn svg{background:#fff;border-radius:50%;padding:2px;width:22px;height:22px}
.hv-gate-link{margin-top:14px;background:none;border:0;color:var(--slate);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}
.hv-gate-err{color:var(--err);font-size:14px;margin:0 0 14px}
.hv-gate-small{font-size:13px;margin:16px 0 0}
.hv-gate-tag{font-family:'Sora',sans-serif;font-weight:300;font-size:17px;color:var(--text);opacity:.85}
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
  if (/popup-blocked/.test(c)) return "Your browser blocked the Google sign-in window. Allow pop-ups for this site (or turn off the pop-up blocker), then tap Continue with Google again.";
  if (/popup-closed-by-browser|operation-not-supported/.test(c)) return "Google sign-in couldn't open here. Open this page in Safari or Chrome itself (not inside another app), then try again.";
  if (/unauthorized-domain/.test(c)) return "This website isn't allowed to use Google sign-in yet (Firebase > Authentication > Authorized domains).";
  if (/network-request-failed/.test(c)) return "No internet connection. Check it and try again.";
  return "Sign-in failed: " + ((e && e.message) || e);
};

export { friendly as signInError, G as GoogleG };
export default function AuthGate({ children }) {
  const cloud = typeof window !== "undefined" && window.hv && window.hv.cloud;
  const gated = !!(cloud && cloud.configured);
  const [known, setKnown] = useState(false);
  const [user, setUser] = useState(gated ? cloud.user : null);
  const [st, setSt] = useState(gated ? cloud.status() : {});

  useEffect(() => {
    if (!gated) return;
    cloud.authReady().then(() => { setUser(cloud.user); setKnown(true); });
    const a = cloud.onUser((u) => setUser(u)), b = cloud.onStatus(setSt);
    return () => { a(); b(); };
  }, []);

  if (!gated || (known && !user) || (user && st.ready)) return children;   // guests use the app straight away

  const icon = typeof document !== "undefined" && document.querySelector('link[rel="icon"]');


  let body;
  if (!known) body = <p>Loading…</p>;
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
