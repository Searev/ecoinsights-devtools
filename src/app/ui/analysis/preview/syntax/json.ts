/**
 * US-020: line-based JSON tokenizer (ARCH-DECISION-025). Lenient on invalid JSON. A string never
 * spans lines, so the highlighter has no state. Linear time, never throws.
 */
import type { LineHighlighter, LineToken } from "./syntax-types";
import { TokenBuilder, isAsciiLetter, isDigit, isSpace } from "./token-builder";

const LITERALS = new Set(["true", "false", "null"]);

function isWordPart(c: number): boolean {
  return isAsciiLetter(c) || isDigit(c) || c === 95 || c === 36 || c > 127;
}

function scan(text: string): LineToken[] {
  const out = new TokenBuilder();
  const n = text.length;
  let i = 0;
  let ps = 0;
  const flush = (upTo: number): void => {
    if (ps < upTo) out.add(text.slice(ps, upTo));
  };
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 34) {
      flush(i);
      let j = i + 1;
      while (j < n && text.charCodeAt(j) !== 34) j += text.charCodeAt(j) === 92 ? 2 : 1;
      const end = Math.min(j + 1, n);
      let k = end;
      while (k < n && isSpace(text.charCodeAt(k))) k++;
      out.add(text.slice(i, end), j < n && text.charCodeAt(k) === 58 ? "key" : "string");
      i = end;
      ps = i;
    } else if (isDigit(c) || (c === 45 && isDigit(text.charCodeAt(i + 1)))) {
      flush(i);
      let j = i + 1;
      while (j < n) {
        const d = text.charCodeAt(j);
        const exponentSign =
          (d === 43 || d === 45) && (text.charCodeAt(j - 1) | 32) === 101 && isDigit(text.charCodeAt(j + 1));
        if (isDigit(d) || d === 46 || (d | 32) === 101 || exponentSign) j++;
        else break;
      }
      out.add(text.slice(i, j), "number");
      i = j;
      ps = i;
    } else if (isWordPart(c)) {
      let j = i + 1;
      while (j < n && isWordPart(text.charCodeAt(j))) j++;
      if (j - i <= 5 && LITERALS.has(text.slice(i, j))) {
        flush(i);
        out.add(text.slice(i, j), "literal");
        ps = j;
      }
      i = j;
    } else {
      i++;
    }
  }
  flush(n);
  return out.finish();
}

export function createJsonHighlighter(): LineHighlighter {
  return {
    line(text: string): LineToken[] {
      try {
        return scan(text);
      } catch {
        return text.length > 0 ? [{ text }] : [];
      }
    },
  };
}
