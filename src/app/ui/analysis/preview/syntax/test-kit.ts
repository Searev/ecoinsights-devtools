/**
 * Shared helpers of the tokenizer tests (never imported by production code): invariant checks, a
 * seeded PRNG, hostile fixtures and a line-by-line runner.
 */
import type { LineHighlighter, LineToken, TextLanguage } from "./syntax-types";

export const LANGUAGES: readonly TextLanguage[] = ["javascript", "json", "css", "markup"];

/** Coloured tokens only, as `kind:text`, in order. */
export function coloured(tokens: readonly LineToken[]): string[] {
  return tokens.filter((t) => t.kind !== undefined).map((t) => `${t.kind}:${t.text}`);
}

/** Highlights each line of `lines` in order with one highlighter. */
export function highlightLines(h: LineHighlighter, lines: readonly string[]): LineToken[][] {
  return lines.map((l) => h.line(l));
}

/** Throws a readable error when the token invariant is broken for `line`. */
export function assertInvariant(line: string, tokens: readonly LineToken[]): void {
  let joined = "";
  for (const t of tokens) {
    if (t.text.length === 0) throw new Error(`empty token in ${JSON.stringify(line.slice(0, 80))}`);
    joined += t.text;
  }
  if (joined !== line) {
    throw new Error(`tokens do not join to the line ${JSON.stringify(line.slice(0, 80))}`);
  }
}

/** Highlights every line, checking the invariant; returns the number of tokens. */
export function runChecked(h: LineHighlighter, lines: readonly string[]): number {
  let count = 0;
  for (const line of lines) {
    const tokens = h.line(line);
    assertInvariant(line, tokens);
    count += tokens.length;
  }
  return count;
}

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIALS = [
  "<", ">", "/", "*", "`", "\\", '"', "'", "{", "}", "(", ")", "[", "]", ":", ";", "=", "!", "-",
  "#", "@", "$", "&", " ", "\t", "<!--", "-->", "</", "/>", "${", "/*", "*/", "//", "<script", "</style",
];

/** A random line mixing structural characters, ASCII, BMP characters and lone surrogates. */
export function randomLine(random: () => number): string {
  const length = Math.floor(random() * 60);
  let line = "";
  for (let i = 0; i < length; i++) {
    const r = random();
    if (r < 0.45) line += SPECIALS[Math.floor(random() * SPECIALS.length)];
    else if (r < 0.8) line += String.fromCharCode(32 + Math.floor(random() * 95));
    else if (r < 0.9) line += String.fromCharCode(Math.floor(random() * 0x800));
    else if (r < 0.95) line += String.fromCharCode(0xd800 + Math.floor(random() * 0x800));
    else line += String.fromCodePoint(0x10000 + Math.floor(random() * 0x1000));
  }
  return line;
}

/** US-020 S8 and other hostile inputs, one line each. */
export const HOSTILE_LINES: readonly string[] = [
  "</pre><script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "</pre><style>body{display:none}</style>",
  '<a href="javascript:alert(1)">x</a>',
  "<!--",
  '"',
  "'",
  "`",
  "/*",
  "<",
  "</",
  "<script",
  "<![CDATA[",
  "\\",
  "\u0000\u0001￿\ud800",
  "{{{{{{{{{{".repeat(1000),
  "${".repeat(10_000),
  "[".repeat(10_000),
  "<a ".repeat(5_000),
  "/x".repeat(10_000),
];

export function repeatToLength(snippet: string, length: number): string {
  const parts: string[] = [];
  let total = 0;
  while (total < length) {
    parts.push(snippet);
    total += snippet.length;
  }
  return parts.join("");
}
