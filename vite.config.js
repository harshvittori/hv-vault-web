import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
import fs from "fs";

// Harsh Reset loads these from /hv-vault-web/: HV Vault's cloud client and the shared apply rule.
const shareWithReset = () => ({
  name: "share-with-reset",
  closeBundle() {
    fs.mkdirSync("dist/shared", { recursive: true });
    fs.copyFileSync("hv-cloud.js", "dist/hv-cloud.js");
    fs.copyFileSync("shared/apply-rule.js", "dist/shared/apply-rule.js");
  },
});
// Web build of HV Vault for GitHub Pages. Built automatically by .github/workflows/pages.yml
export default defineConfig({
  plugins: [react(), shareWithReset()],
  base: "./",
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
