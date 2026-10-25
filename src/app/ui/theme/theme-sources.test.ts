/**
 * US-030 guard (ARCH-DECISION-034): every colour of the panel comes from a theme token. This test
 * scans the UI sources and fails on a Tailwind palette class, a hex / rgb() / hsl() literal or an SVG
 * `fill="#…"` outside the allow-list below.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "..");

/** Files allowed to hold colour literals, relative to `src/app`, with the reason. */
const ALLOWED: Record<string, string> = {
  "ui/theme/": "token definitions",
  "ui/analysis/preview/syntax/syntax-palette.ts": "syntax palettes (ARCH-DECISION-025)",
  "ui/shared/icons/Logo.tsx": "brand logo, same in both themes",
  "ui/shared/ecoindex-badge-style.ts": "black or white text on the grade colour, by contrast",
  "domain/": "not UI: grade colours from ecoindex_reference and content fixtures",
  "infra/": "fakes drawing content images, which keep their own colours",
};

const PALETTE =
  "(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|primary)";
const UTILITY =
  "(?:bg|text|border(?:-[trblxyse])?|outline|fill|stroke|ring|ring-offset|divide|from|via|to|placeholder|accent|caret|decoration|shadow)";

const PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "Tailwind palette class", regex: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*${UTILITY}-${PALETTE}(?:-\\d{2,3})?(?:/\\d+)?(?![\\w-])`, "g") },
  { name: "hex colour", regex: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g },
  { name: "rgb()/hsl() literal", regex: /\b(?:rgba?|hsla?)\((?!\s*var\()/g },
];

/** Every colour literal of a source text, as `name: match`. */
export function findColourLiterals(source: string): string[] {
  const found: string[] = [];
  for (const { name, regex } of PATTERNS) {
    for (const match of source.matchAll(regex)) found.push(`${name}: ${match[0]}`);
  }
  return found;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    if (/\.test\.ts$/.test(entry) || entry.endsWith(".d.ts")) return [];
    return /\.(tsx?|css)$/.test(entry) ? [path] : [];
  });
}

const files = sources(APP)
  .map((path) => relative(APP, path).split(sep).join("/"))
  .filter((path) => !Object.keys(ALLOWED).some((allowed) => path === allowed || path.startsWith(allowed)));

describe("findColourLiterals", () => {
  it.each([
    'class="bg-surface text-white"',
    'class="hover:bg-red-500"',
    'class="focus-visible:outline-white"',
    'class="active:border-primary-500"',
    'class="border-t-gray-200"',
    'class="bg-black/50"',
    'fill="#bfc6ce"',
    "background-color: #555;",
    "border: 8px solid #3f51b5;",
    "background: rgba(0, 0, 0, 0.8);",
    "color: hsl(0 0% 50%);",
  ])("catches %s", (sample) => {
    expect(findColourLiterals(sample)).not.toEqual([]);
  });

  it.each([
    'class="bg-surface text-strong border-border outline-focus"',
    'class="text-overflow-ellipsis text-left text-xs bg-transparent text-inherit"',
    'class="bg-complianceA bg-selected hover:bg-selectedHover text-onSelected"',
    'fill="currentColor"',
    "background-color: rgb(var(--color-tooltip));",
    "color: var(--text-view-text);",
    'href="#top"',
    "&#160;",
  ])("accepts %s", (sample) => {
    expect(findColourLiterals(sample)).toEqual([]);
  });
});

describe("UI sources", () => {
  it("finds the UI sources", () => {
    expect(files).toContain("Toolbar.tsx");
    expect(files).toContain("index.css");
    expect(files).toContain("ui/shared/Loader/Loader.css");
  });

  it.each(files)("%s uses theme tokens only", (path) => {
    expect(findColourLiterals(readFileSync(join(APP, path), "utf8"))).toEqual([]);
  });
});
