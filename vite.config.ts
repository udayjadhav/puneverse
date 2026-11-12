import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  // GitHub project pages need `/puneverse/`; Cloudflare Pages uses `/`.
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@config": path.resolve(__dirname, "config"),
    },
  },
  worker: {
    format: "es",
  },
  server: {
    fs: {
      allow: [".", "config", "public"],
    },
  },
});

