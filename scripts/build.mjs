import { fileURLToPath } from "node:url";
const HERE = fileURLToPath(new URL(".", import.meta.url));
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";
import { readManifest, TARGETS } from "./manifest.mjs";

const root = resolve(HERE, "..");

const arg = process.argv.find((a) => a.startsWith("--target="));
const target = arg?.slice("--target=".length);
if (!TARGETS.includes(target)) {
  console.error(`Usage: node scripts/build.mjs --target=${TARGETS.join("|")}`);
  process.exit(1);
}

const entries = [
  { in: "src/background/index.ts", out: "scripts/background.js" },
  { in: "src/content/probe.ts", out: "scripts/probe.js" },
];

const missing = entries.filter((e) => !existsSync(resolve(root, e.in)));
if (missing.length) {
  console.error(`Build failed: missing entry point(s): ${missing.map((e) => e.in).join(", ")}`);
  process.exit(1);
}

const outDir = resolve(root, "dist", target);
rmSync(outDir, { recursive: true, force: true });
rmSync(`${outDir}.zip`, { force: true });
mkdirSync(outDir, { recursive: true });

await viteBuild({ configFile: resolve(root, "vite.config.ts"), base: "./", build: { outDir, emptyOutDir: true } });

for (const e of entries) {
  await esbuild({
    entryPoints: [resolve(root, e.in)],
    outfile: resolve(outDir, e.out),
    bundle: true,
    minify: true,
    format: "iife",
    target: ["chrome102", "firefox109"],
    logLevel: "warning",
  });
}

writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(readManifest(target), null, 2) + "\n");

const zip = spawnSync("zip", ["-r", "-q", `${target}.zip`, target], { cwd: resolve(root, "dist") });
if (zip.error || zip.status !== 0) {
  console.warn(`Warning: could not create dist/${target}.zip (is "zip" installed?). Skipping.`);
} else {
  console.log(`Created dist/${target}.zip`);
}
console.log(`Built dist/${target}`);
