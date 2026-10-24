/**
 * US-020: line-based, stateful JavaScript tokenizer (ARCH-DECISION-025). Best effort: regex
 * detection uses the previous significant token and `${ }` is tracked with a brace depth. Linear
 * time, never throws, tokens always join to the input line.
 */
import type { LineHighlighter, LineToken } from "./syntax-types";
import { TokenBuilder, isDigit, isAsciiLetter, isHexDigit, isSpace } from "./token-builder";

const KEYWORDS = new Set(
  (
    "break case catch class const continue debugger default delete do else export extends finally " +
    "for function if import in instanceof let new of return static super switch this throw try " +
    "typeof var void while with yield async await get set"
  ).split(" "),
);
const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);
/** Keywords after which a value (not a regex) may follow. */
const VALUE_KEYWORDS = new Set(["this", "super"]);
const MAX_WORD = 12;

/** What the previous significant token allows next. */
type Previous = "none" | "value" | "operator" | "dot";

function isIdentStart(c: number): boolean {
  return isAsciiLetter(c) || c === 95 || c === 36 || c === 35 || c > 127;
}

function isIdentPart(c: number): boolean {
  return isIdentStart(c) || isDigit(c);
}

export function createJavaScriptHighlighter(): LineHighlighter {
  let inBlockComment = false;
  let inTemplate = false;
  let depth = 0;
  const stack: number[] = [];
  let previous: Previous = "none";

  function scan(text: string): LineToken[] {
    const out = new TokenBuilder();
    const n = text.length;
    let i = 0;
    let ps = 0;
    let regexFailed = false;

    const flush = (upTo: number): void => {
      if (ps < upTo) out.add(text.slice(ps, upTo));
    };

    /** Scans template text from `from` (the token starts at `start`); returns the next index. */
    const template = (start: number, from: number): number => {
      let j = from;
      inTemplate = true;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 92) {
          j += 2;
        } else if (c === 96) {
          out.add(text.slice(start, j + 1), "string");
          inTemplate = false;
          previous = "value";
          return j + 1;
        } else if (c === 36 && text.charCodeAt(j + 1) === 123) {
          out.add(text.slice(start, j), "string");
          out.add("${");
          stack.push(depth);
          depth = 0;
          inTemplate = false;
          previous = "operator";
          return j + 2;
        } else {
          j++;
        }
      }
      out.add(text.slice(start), "string");
      return n;
    };

    const regexEnd = (from: number): number => {
      let j = from + 1;
      let inClass = false;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 92) {
          j += 2;
          continue;
        }
        if (inClass) {
          if (c === 93) inClass = false;
        } else if (c === 91) {
          inClass = true;
        } else if (c === 47) {
          j++;
          while (j < n && isAsciiLetter(text.charCodeAt(j))) j++;
          return j;
        }
        j++;
      }
      return -1;
    };

    const numberEnd = (from: number): number => {
      let j = from;
      let hex = false;
      let seenDot = false;
      let seenExp = false;
      const first = text.charCodeAt(j);
      const second = text.charCodeAt(j + 1) | 32;
      if (first === 48 && (second === 120 || second === 111 || second === 98)) {
        hex = true;
        j += 2;
      } else if (first === 46) {
        seenDot = true;
        j++;
      }
      while (j < n) {
        const c = text.charCodeAt(j);
        if (isDigit(c) || c === 95 || (hex && isHexDigit(c))) {
          j++;
        } else if (c === 46 && !hex && !seenDot && !seenExp) {
          seenDot = true;
          j++;
        } else if ((c === 101 || c === 69) && !hex && !seenExp) {
          const next = text.charCodeAt(j + 1);
          const signed = next === 43 || next === 45;
          if (isDigit(signed ? text.charCodeAt(j + 2) : next)) {
            seenExp = true;
            j += signed ? 2 : 1;
          } else break;
        } else if (c === 110) {
          return j + 1;
        } else break;
      }
      return j;
    };

    if (inBlockComment) {
      const end = text.indexOf("*/");
      if (end < 0) {
        out.add(text, "comment");
        return out.finish();
      }
      out.add(text.slice(0, end + 2), "comment");
      inBlockComment = false;
      i = end + 2;
      ps = i;
    } else if (inTemplate) {
      i = template(0, 0);
      ps = i;
    }

    while (i < n) {
      const c = text.charCodeAt(i);
      if (isSpace(c)) {
        i++;
      } else if (c === 47) {
        const next = text.charCodeAt(i + 1);
        if (next === 47) {
          flush(i);
          out.add(text.slice(i), "comment");
          return out.finish();
        }
        if (next === 42) {
          flush(i);
          const end = text.indexOf("*/", i + 2);
          if (end < 0) {
            out.add(text.slice(i), "comment");
            inBlockComment = true;
            return out.finish();
          }
          out.add(text.slice(i, end + 2), "comment");
          i = end + 2;
          ps = i;
        } else {
          let end = -1;
          if (previous !== "value" && !regexFailed) {
            end = regexEnd(i);
            if (end < 0) regexFailed = true;
          }
          if (end > 0) {
            flush(i);
            out.add(text.slice(i, end), "string");
            previous = "value";
            i = end;
            ps = i;
          } else {
            previous = "operator";
            i++;
          }
        }
      } else if (c === 34 || c === 39) {
        flush(i);
        let j = i + 1;
        while (j < n && text.charCodeAt(j) !== c) j += text.charCodeAt(j) === 92 ? 2 : 1;
        const end = Math.min(j + 1, n);
        out.add(text.slice(i, end), "string");
        previous = "value";
        i = end;
        ps = i;
      } else if (c === 96) {
        flush(i);
        i = template(i, i + 1);
        ps = i;
      } else if (isDigit(c) || (c === 46 && isDigit(text.charCodeAt(i + 1)))) {
        flush(i);
        const end = numberEnd(i);
        out.add(text.slice(i, end), "number");
        previous = "value";
        i = end;
        ps = i;
      } else if (isIdentStart(c)) {
        let j = i + 1;
        while (j < n && isIdentPart(text.charCodeAt(j))) j++;
        const word = j - i <= MAX_WORD ? text.slice(i, j) : "";
        if (previous === "dot" || word === "") {
          previous = "value";
        } else if (KEYWORDS.has(word)) {
          flush(i);
          out.add(word, "keyword");
          ps = j;
          previous = VALUE_KEYWORDS.has(word) ? "value" : "operator";
        } else if (LITERALS.has(word)) {
          flush(i);
          out.add(word, "literal");
          ps = j;
          previous = "value";
        } else {
          previous = "value";
        }
        i = j;
      } else if (c === 46) {
        previous = "dot";
        i++;
      } else if (c === 41 || c === 93) {
        previous = "value";
        i++;
      } else if (c === 123) {
        depth++;
        previous = "operator";
        i++;
      } else if (c === 125) {
        if (depth > 0) {
          depth--;
          previous = "operator";
          i++;
        } else if (stack.length > 0) {
          flush(i + 1);
          depth = stack.pop() ?? 0;
          i = template(i + 1, i + 1);
          ps = i;
        } else {
          previous = "operator";
          i++;
        }
      } else {
        previous = "operator";
        i++;
      }
    }
    flush(n);
    return out.finish();
  }

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
