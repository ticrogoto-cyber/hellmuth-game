import { defineConfig } from "vite";

// HELLMUTH dev/build config. Browser zuerst.
// Die JSON-Datendefinitionen unter `game/data/*.json` werden im Loader per
// statischem Import eingebunden (siehe src/data/loader.ts) und damit von Vite
// gebündelt. Kein Laufzeit-fetch noetig.
export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
