/**
 * US-020: pure helpers turning the bytes of a text file into the lines the viewer displays.
 * Linear scans only (no regex split): they run on up to 25 MB.
 */
import { MAX_PREVIEW_TEXT_CHARS } from "../../../domain/file-preview/policy";

export interface TextDocument {
  /** UTF-16 code units of the whole text. */
  characters: number;
  /** Lines of the whole text (a final line break does not start a new line). */
  lineCount: number;
  /** True when the display was cut at the cap. */
  truncated: boolean;
  /** Displayed lines: those of the first `maxChars` code units. */
  lines: string[];
}

/** Decodes `bytes` with `charset`; an unknown label falls back to UTF-8. Never throws. */
export function decodePreviewText(bytes: Uint8Array, charset: string): string {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset, { fatal: false });
  } catch {
    decoder = new TextDecoder("utf-8", { fatal: false });
  }
  return decoder.decode(bytes);
}

const LF = 10;
const CR = 13;

/** Calls `onLine(start, end)` for each line of `text`: breaks are `\r\n`, `\n` or `\r`. */
function eachLine(text: string, onLine: (start: number, end: number) => void): void {
  const length = text.length;
  let start = 0;
  for (let i = 0; i < length; i++) {
    const code = text.charCodeAt(i);
    if (code === LF) {
      onLine(start, i);
      start = i + 1;
    } else if (code === CR) {
      onLine(start, i);
      if (i + 1 < length && text.charCodeAt(i + 1) === LF) i++;
      start = i + 1;
    }
  }
  if (start < length) onLine(start, length);
}

/** Number of lines: breaks plus one, minus one when the text ends with a break; 0 when empty. */
export function countLines(text: string): number {
  let count = 0;
  eachLine(text, () => void count++);
  return count;
}

export function prepareTextDocument(text: string, maxChars: number = MAX_PREVIEW_TEXT_CHARS): TextDocument {
  const characters = text.length;
  const truncated = characters > maxChars;
  let end = truncated ? maxChars : characters;
  if (truncated && end > 0) {
    const last = text.charCodeAt(end - 1);
    // Do not split a surrogate pair.
    if (last >= 0xd800 && last <= 0xdbff) end--;
  }
  const shown = truncated ? text.slice(0, end) : text;
  const lines: string[] = [];
  eachLine(shown, (s, e) => void lines.push(shown.slice(s, e)));
  return { characters, lineCount: truncated ? countLines(text) : lines.length, truncated, lines };
}
