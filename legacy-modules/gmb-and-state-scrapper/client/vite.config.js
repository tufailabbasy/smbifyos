const { defineConfig } = require("vite");

module.exports = defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4001",
        changeOrigin: true,
      },
    },
  },
});
