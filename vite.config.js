import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
import fs from "fs";

// HV Reset loads these from /hv-vault-web/: HV Vault's cloud client, the shared apply rule and HV AI.
const shareWithReset = () => ({
  name: "share-with-reset",
  closeBundle() {
    fs.mkdirSync("dist/shared", { recursive: true });
    fs.copyFileSync("hv-cloud.js", "dist/hv-cloud.js");
    fs.copyFileSync("shared/apply-rule.js", "dist/shared/apply-rule.js");
    fs.copyFileSync("shared/hv-ai.js", "dist/shared/hv-ai.js");
  },
});
// Web build of HV Vault for GitHub Pages. Built automatically by .github/workflows/pages.yml
export default defineConfig({
  plugins: [react(), shareWithReset()],
  base: "./",
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
