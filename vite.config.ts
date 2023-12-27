import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { resolve } from "path";
// import devtools from 'solid-devtools/vite';

const root = resolve(__dirname, "src");
const outDir = resolve(__dirname, "dist");

export default defineConfig({
  root,
  plugins: [
    /* 
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    // devtools(),
    solidPlugin(),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: ["chrome88", "firefox109"],
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
