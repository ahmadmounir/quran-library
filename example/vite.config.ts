import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import sirv from "sirv";

/**
 * The repository's own `data/` folder (page files, fonts, reciters' indexes, and the MP3s once you build them) is
 * served at `/data`, both by `npm run dev` and by `npm run preview`, so the example runs with no hosting at all.
 * In production point VITE_FILES_BASE at your Worker instead (see `.env.example`).
 */
function repositoryData(): Plugin {
  const serve = sirv(path.resolve(__dirname, "../data"), { dev: true, etag: true });
  return {
    name: "quran-library-data",
    configureServer(server) {
      server.middlewares.use("/data", serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/data", serve);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), repositoryData()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5175 },
  preview: { port: 4175 },
  build: {
    rollupOptions: {
      output: {
        // The libraries in one chunk of their own: a new deploy of the app's code leaves them cached
        manualChunks(id) {
          return id.includes("node_modules") ? "vendor" : undefined;
        },
      },
    },
  },
});
