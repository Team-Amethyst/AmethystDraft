import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Hosts allowed in dev/preview when the SPA is opened via a non-local hostname
// (e.g. https://draftroom.uk via reverse proxy or tunnel).
const draftroomHosts = ["draftroom.uk", ".draftroom.uk", "www.draftroom.uk"];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ["localhost", ".localhost", ...draftroomHosts],
  },
  preview: {
    allowedHosts: ["localhost", ".localhost", ...draftroomHosts],
  },
});
