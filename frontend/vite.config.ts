import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/reactflow/") || id.includes("/node_modules/@reactflow/")) {
            return "graph-vendor";
          }
          if (id.includes("/node_modules/gsap/") || id.includes("/node_modules/@gsap/")) {
            return "motion-vendor";
          }
          if (id.includes("/node_modules/lucide-react/")) {
            return "icons-vendor";
          }
          if (id.includes("/node_modules/three/")) {
            return "three-vendor";
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:8000"
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
});
