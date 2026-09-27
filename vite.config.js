import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
// Web build of HV Vault for GitHub Pages. Built automatically by .github/workflows/pages.yml
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
