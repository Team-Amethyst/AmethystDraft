import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Hosts allowed in dev/preview when the SPA is opened via a non-local hostname
// (e.g. https://draftroom.uk via reverse proxy or tunnel).
const draftroomHosts = ["draftroom.uk", ".draftroom.uk", "www.draftroom.uk"];

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const parsedPort = Number.parseInt(env.VITE_PORT ?? "", 10);
  const devPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5173;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: devPort,
      allowedHosts: ["localhost", ".localhost", ...draftroomHosts],
    },
    preview: {
      allowedHosts: ["localhost", ".localhost", ...draftroomHosts],
    },
  };
});
