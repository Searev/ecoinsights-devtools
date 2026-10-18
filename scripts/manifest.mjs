import { fileURLToPath } from "node:url";
const HERE = fileURLToPath(new URL(".", import.meta.url));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const TARGETS = ["chrome", "firefox"];

const manifestDir = resolve(HERE, "../src/manifest");

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Pure deep merge: objects merge recursively, arrays and scalars are replaced by the overlay. */
export function mergeManifest(base, overlay) {
  const out = {};
  for (const [key, value] of Object.entries(base)) {
    out[key] = isPlainObject(value) ? mergeManifest(value, {}) : Array.isArray(value) ? [...value] : value;
  }
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = mergeManifest(out[key], value);
    else if (isPlainObject(value)) out[key] = mergeManifest({}, value);
    else out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

const readJson = (name) => JSON.parse(readFileSync(resolve(manifestDir, name), "utf8"));

export function readManifest(target) {
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown target "${target}": expected one of ${TARGETS.join(", ")}`);
  }
  return mergeManifest(readJson("base.json"), readJson(`${target}.json`));
}
