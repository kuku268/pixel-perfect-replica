import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Plain Vite + React SPA. `vite build` emits a fully static bundle to dist/,
// which Vercel serves with the SPA fallback declared in vercel.json.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    host: true,
    port: 8080,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
