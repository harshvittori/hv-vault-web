// Must be the first import: in a browser it installs window.storage + window.hv.
// Inside Electron the preload has already defined them, so it does nothing.
import "./web-bridge.js";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./auth-gate.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
