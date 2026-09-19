import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["xlsx"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
      },
      "/public-api": {
        target: "http://localhost:5050",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5050",
        ws: true,
      },
    },
  },
});
