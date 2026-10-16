import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // In development the SPA runs on Vite; API calls go to `wrangler dev`.
  server: { proxy: { "/api": "http://localhost:8787" } },
});
