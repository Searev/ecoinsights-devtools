import { posix, resolve } from "node:path";
import { build } from "esbuild";

/**
 * Bundles the theme boot entry into a minified classic script (IIFE, no import/export) that is
 * served as an external file, so the extension CSP stays untouched (ARCH-DECISION-035).
 * A relative `entry` is resolved against the current working directory (the repo root when run through npm).
 */
export async function buildThemeBoot(entry) {
  const result = await build({
    entryPoints: [resolve(entry)],
    bundle: true,
    write: false,
    format: "iife",
    minify: true,
    target: ["chrome103", "firefox109"],
    legalComments: "none",
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

/**
 * Vite plugin: serves the boot script in dev, emits it as an asset in a build, and prepends a
 * classic `<script src>` to the head of `htmlFile` only (not devtools.html).
 */
export function themeBootPlugin({ entry, fileName = "theme-boot.js", htmlFile = "index.html" }) {
  let cached;
  const code = () => (cached ??= buildThemeBoot(entry));
  const isTarget = (value) => typeof value === "string" && posix.basename(value.replaceAll("\\", "/")) === htmlFile;

  return {
    name: "ecoinsights-theme-boot",

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (path !== `/${fileName}`) return next();
        try {
          const source = await code();
          res.setHeader("Content-Type", "text/javascript");
          res.end(source);
        } catch (error) {
          next(error);
        }
      });
    },

    async generateBundle() {
      this.emitFile({ type: "asset", fileName, source: await code() });
    },

    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!isTarget(ctx?.path) && !isTarget(ctx?.filename)) return undefined;
        return [{ tag: "script", attrs: { src: `./${fileName}` }, injectTo: "head-prepend" }];
      },
    },
  };
}
