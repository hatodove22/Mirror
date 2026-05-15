import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8004";
  const host = process.env.VITE_HOST ?? env.VITE_HOST ?? "127.0.0.1";
  const port = Number(process.env.VITE_PORT ?? env.VITE_PORT ?? 5173);

  return {
    plugins: [react()],
    server: {
      host,
      port,
      proxy: {
        "/api": apiProxyTarget,
      },
    },
  };
});
