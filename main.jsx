// Must be the first import: in a browser it installs window.storage + window.hv.
// Inside Electron the preload has already defined them, so it does nothing.
import "./web-bridge.js";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./auth-gate.jsx";
import "./index.css";

// Smooth scrolling: while any part of the page scrolls, background animations hold still.
// Only the sky is flagged, so nothing else has to restyle.
{
  let t = 0;
  const sky = (on) => { const el = document.querySelector(".hv-sky"); if (el) el.classList.toggle("still", on); };
  window.addEventListener("scroll", () => {
    if (!t) sky(true);
    clearTimeout(t); t = setTimeout(() => { sky(false); t = 0; }, 180);
  }, { capture: true, passive: true });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
