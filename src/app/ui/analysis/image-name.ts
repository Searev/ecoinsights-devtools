/**
 * Display name of an image in the best-practice lines (US-004, ARCH-DECISION-015).
 * Pure and O(n) in the length of the name.
 */

export interface DisplayImageName {
  /** Text shown on screen, shortened when the stem is long. */
  short: string;
  /** Decoded file name (or host name), without query string. */
  full: string;
}

const MAX_STEM_CHARACTERS = 24;
const KEPT_EACH_SIDE = 12;
const EXTENSION = /^[\p{L}\p{N}]{1,5}$/u;
const COMBINING_MARK = /^\p{M}$/u;

const ZWJ = 0x200d;

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/** Code points that attach to the previous character. */
function isGlued(cp: number, ch: string): boolean {
  return (
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0020 && cp <= 0xe007f) ||
    (cp > 0x2ff && COMBINING_MARK.test(ch))
  );
}

/**
 * Splits into user-perceived characters without `Intl.Segmenter` (missing in Firefox < 125):
 * code points, with combining marks, ZWJ sequences, variation selectors, emoji modifiers and tags
 * glued to the previous character, and regional indicators paired two by two.
 */
function splitCharacters(text: string): string[] {
  const characters: string[] = [];
  let afterZwj = false;
  let openFlag = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const last = characters.length - 1;
    if (last >= 0 && afterZwj) {
      characters[last] += ch;
      afterZwj = false;
      openFlag = false;
    } else if (last >= 0 && cp === ZWJ) {
      characters[last] += ch;
      afterZwj = true;
    } else if (last >= 0 && isGlued(cp, ch)) {
      characters[last] += ch;
    } else if (isRegionalIndicator(cp)) {
      if (last >= 0 && openFlag) {
        characters[last] += ch;
        openFlag = false;
      } else {
        characters.push(ch);
        openFlag = true;
      }
    } else {
      characters.push(ch);
      openFlag = false;
    }
  }
  return characters;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function lastSegment(path: string): string | undefined {
  const segments = path.split("/").filter((s) => s !== "");
  return segments.length > 0 ? segments[segments.length - 1] : undefined;
}

function fullNameOf(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = lastSegment(parsed.pathname);
    return segment === undefined ? parsed.hostname : decode(segment);
  } catch {
    const path = url.split("#")[0].split("?")[0];
    const segment = lastSegment(path);
    return segment === undefined ? url : decode(segment);
  }
}

export function displayImageName(url: string): DisplayImageName {
  const full = fullNameOf(url);

  const dot = full.lastIndexOf(".");
  const hasExtension = dot > 0 && EXTENSION.test(full.slice(dot + 1));
  const stem = hasExtension ? full.slice(0, dot) : full;
  const extension = hasExtension ? full.slice(dot) : "";

  // A stem of at most 24 UTF-16 units cannot hold more than 24 characters.
  if (stem.length <= MAX_STEM_CHARACTERS) return { short: full, full };
  const characters = splitCharacters(stem);
  if (characters.length <= MAX_STEM_CHARACTERS) return { short: full, full };

  const head = characters.slice(0, KEPT_EACH_SIDE).join("");
  const tail = characters.slice(-KEPT_EACH_SIDE).join("");
  return { short: `${head}...${tail}${extension}`, full };
}
