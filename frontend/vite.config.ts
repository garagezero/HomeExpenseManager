import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development, proxy API calls to the backend.
// BACKEND_PROXY lets docker-compose point this at the backend container
// (e.g. http://backend:8080); locally it defaults to localhost.
const backendTarget = process.env.BACKEND_PROXY || "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
  // The document-scan feature lazy-loads this on demand; keep it out of the
  // dependency pre-bundle so it doesn't slow down dev server startup or
  // trip up esbuild on its embedded WASM.
  optimizeDeps: {
    exclude: ["@techstark/opencv-js"],
  },
});
