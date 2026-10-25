import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { resolve } from "path";
import { themeBootPlugin } from "./scripts/vite-theme-boot.mjs";
// import devtools from 'solid-devtools/vite';

const root = resolve(__dirname, "src");
// Overridable: scripts/build.mjs passes build.outDir per target (dist/<target>).
const outDir = resolve(__dirname, "dist/chrome");

export default defineConfig({
  root,
  plugins: [
    /* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    // devtools(),
    solidPlugin(),
    // US-030: classic pre-paint script applying the stored theme without relaxing the CSP (ARCH-DECISION-035).
    themeBootPlugin({ entry: resolve(root, "app/ui/theme/theme-boot.entry.ts") }),
  ],
  server: {
    port: 3000,
  },
  // The codec worker is an IIFE so that it also loads as a classic worker in Firefox (ARCH-DECISION-009).
  worker: { format: "iife" },
  // WASM codecs are loaded by the worker with `new URL(..., import.meta.url)`: do not pre-bundle them.
  optimizeDeps: {
    exclude: [
      "@jsquash/jpeg",
      "@jsquash/png",
      "@jsquash/oxipng",
      "@jsquash/webp",
      "@jsquash/avif",
      "@jsquash/resize",
    ],
  },
  build: {
    target: ["chrome103", "firefox109"],
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(root, "devtools.html"),
        app: resolve(root, "index.html"),
      },
    },
  },
});
