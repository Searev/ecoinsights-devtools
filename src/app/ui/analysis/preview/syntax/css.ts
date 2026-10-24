/**
 * US-020: line-based, stateful CSS tokenizer (ARCH-DECISION-025). Tracks comments, block depth
 * (rules containers such as `@media` versus declaration blocks) and whether a value is open, across
 * lines. Best effort; linear time, never throws, tokens always join to the input line.
 */
import type { LineHighlighter, LineToken } from "./syntax-types";
import { TokenBuilder, isAsciiLetter, isDigit, isHexDigit, isSpace } from "./token-builder";

/** At-rules whose block contains rules; the others contain declarations. */
const RULE_CONTAINERS = new Set([
  "media", "supports", "layer", "container", "document", "keyframes", "scope", "starting-style",
]);

function isIdentChar(c: number): boolean {
  return isAsciiLetter(c) || isDigit(c) || c === 45 || c === 95 || c > 127;
}

function containerName(name: string): boolean {
  const lower = name.toLowerCase();
  return RULE_CONTAINERS.has(lower.replace(/^-[a-z]+-/, ""));
}

export function createCssHighlighter(): LineHighlighter {
  let inComment = false;
  /** One entry per open block: true when it holds declarations. */
  const blocks: boolean[] = [];
  /** Kind of the next block opened by `{`. */
  let nextBlockDeclarations = true;
  /** Inside the parameters of an at-rule (after its name, up to `{` or `;`). */
  let atParams = false;
  /** In a declaration block: reading the value of a property. */
  let inValue = false;

  function scan(text: string): LineToken[] {
    const out = new TokenBuilder();
    const n = text.length;
    let i = 0;

    const inDeclarations = (): boolean => blocks.length > 0 && blocks[blocks.length - 1];

    const atRule = (): void => {
      let j = i + 1;
      while (j < n && isIdentChar(text.charCodeAt(j))) j++;
      const name = text.slice(i + 1, j);
      out.add(text.slice(i, j), "keyword");
      nextBlockDeclarations = inDeclarations() || !containerName(name);
      atParams = true;
      i = j;
    };

    const stringEnd = (from: number): number => {
      const quote = text.charCodeAt(from);
      let j = from + 1;
      while (j < n && text.charCodeAt(j) !== quote) j += text.charCodeAt(j) === 92 ? 2 : 1;
      return Math.min(j + 1, n);
    };

    /** Index of the end of a plain chunk: stops at `{ } ;`, a quote, or a comment start. */
    const chunkEnd = (from: number, stopAtBrace: boolean): number => {
      let j = from;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 59 || c === 125 || c === 34 || c === 39) break;
        if (c === 123 && stopAtBrace) break;
        if (c === 47 && text.charCodeAt(j + 1) === 42) break;
        j++;
      }
      return j;
    };

    const emitTrimmed = (from: number, to: number, kind: LineToken["kind"]): void => {
      let end = to;
      while (end > from && isSpace(text.charCodeAt(end - 1))) end--;
      out.add(text.slice(from, end), kind);
      if (end < to) out.space(text.slice(end, to));
    };

    const closeBlock = (): void => {
      blocks.pop();
      inValue = false;
      atParams = false;
      nextBlockDeclarations = true;
    };

    const openBlock = (): void => {
      blocks.push(nextBlockDeclarations);
      nextBlockDeclarations = true;
      atParams = false;
      inValue = false;
    };

    /** Outside a declaration block, or inside an at-rule's parameters. */
    const rules = (c: number): void => {
      if (c === 125) {
        out.add("}");
        closeBlock();
        i++;
      } else if (c === 123) {
        out.add("{");
        openBlock();
        i++;
      } else if (c === 59) {
        out.add(";");
        atParams = false;
        nextBlockDeclarations = true;
        i++;
      } else if (c === 64 && !atParams) {
        atRule();
      } else {
        const end = chunkEnd(i, true);
        emitTrimmed(i, end, atParams ? undefined : "selector");
        i = end;
      }
    };

    /** Start of a statement in a declaration block. */
    const statement = (c: number): void => {
      if (c === 125) {
        out.add("}");
        closeBlock();
        i++;
      } else if (c === 123) {
        out.add("{");
        openBlock();
        i++;
      } else if (c === 59) {
        out.add(";");
        i++;
      } else if (c === 64) {
        atRule();
      } else {
        const end = chunkEnd(i, true);
        if (end < n && text.charCodeAt(end) === 123) {
          emitTrimmed(i, end, "selector");
          i = end;
          return;
        }
        const colon = text.indexOf(":", i);
        if (colon >= 0 && colon < end) {
          emitTrimmed(i, colon, "property");
          out.add(":");
          i = colon + 1;
          inValue = true;
        } else {
          emitTrimmed(i, end, undefined);
          i = end;
        }
      }
    };

    const numberEnd = (from: number): number => {
      let j = from;
      const sign = text.charCodeAt(j);
      if (sign === 43 || sign === 45) j++;
      while (isDigit(text.charCodeAt(j))) j++;
      if (text.charCodeAt(j) === 46 && isDigit(text.charCodeAt(j + 1))) {
        j++;
        while (isDigit(text.charCodeAt(j))) j++;
      }
      const e = text.charCodeAt(j);
      if (e === 101 || e === 69) {
        const next = text.charCodeAt(j + 1);
        const signed = next === 43 || next === 45;
        if (isDigit(signed ? text.charCodeAt(j + 2) : next)) {
          j += signed ? 2 : 1;
          while (isDigit(text.charCodeAt(j))) j++;
        }
      }
      if (text.charCodeAt(j) === 37) return j + 1;
      while (isAsciiLetter(text.charCodeAt(j))) j++;
      return j;
    };

    const startsNumber = (c: number, at: number): boolean => {
      if (isDigit(c)) return true;
      if (c === 46) return isDigit(text.charCodeAt(at + 1));
      if (c === 43 || c === 45) {
        const d = text.charCodeAt(at + 1);
        return isDigit(d) || (d === 46 && isDigit(text.charCodeAt(at + 2)));
      }
      return false;
    };

    /** Inside the value of a declaration. */
    const value = (c: number): void => {
      if (c === 59) {
        out.add(";");
        inValue = false;
        i++;
      } else if (c === 125) {
        out.add("}");
        closeBlock();
        i++;
      } else if (c === 123) {
        out.add("{");
        openBlock();
        i++;
      } else if (c === 33) {
        let j = i + 1;
        while (j < n && isAsciiLetter(text.charCodeAt(j))) j++;
        if (j - i === 10 && text.slice(i + 1, j).toLowerCase() === "important") {
          out.add(text.slice(i, j), "keyword");
          i = j;
        } else {
          out.add("!", "value");
          i++;
        }
      } else if (c === 35) {
        let j = i + 1;
        while (j < n && (isHexDigit(text.charCodeAt(j)) || isAsciiLetter(text.charCodeAt(j)) || isDigit(text.charCodeAt(j)))) j++;
        out.add(text.slice(i, j), j > i + 1 ? "number" : "value");
        i = j;
      } else if (startsNumber(c, i) && !(c === 45 && isIdentChar(text.charCodeAt(i + 1)) && !isDigit(text.charCodeAt(i + 1)))) {
        const end = numberEnd(i);
        out.add(text.slice(i, end), "number");
        i = end;
      } else if (isIdentChar(c) || c === 92) {
        let j = i;
        while (j < n) {
          const d = text.charCodeAt(j);
          if (d === 92) j += 2;
          else if (isIdentChar(d)) j++;
          else break;
        }
        j = Math.min(j, n);
        out.add(text.slice(i, j), "value");
        if (j - i === 3 && text.slice(i, j).toLowerCase() === "url" && text.charCodeAt(j) === 40) {
          out.add("(", "value");
          let k = j + 1;
          while (k < n && isSpace(text.charCodeAt(k))) k++;
          const q = text.charCodeAt(k);
          if (k < n && q !== 34 && q !== 39) {
            let close = text.indexOf(")", k);
            if (close < 0) close = n;
            out.add(text.slice(j + 1, close), "value");
            j = close;
          } else {
            j++;
          }
        }
        i = j;
      } else {
        out.add(text.charAt(i), "value");
        i++;
      }
    };

    if (inComment) {
      const end = text.indexOf("*/");
      if (end < 0) {
        out.add(text, "comment");
        return out.finish();
      }
      out.add(text.slice(0, end + 2), "comment");
      inComment = false;
      i = end + 2;
    }

    while (i < n) {
      const c = text.charCodeAt(i);
      const before = i;
      if (isSpace(c)) {
        let j = i + 1;
        while (j < n && isSpace(text.charCodeAt(j))) j++;
        out.space(text.slice(i, j));
        i = j;
      } else if (c === 47 && text.charCodeAt(i + 1) === 42) {
        const end = text.indexOf("*/", i + 2);
        if (end < 0) {
          out.add(text.slice(i), "comment");
          inComment = true;
          return out.finish();
        }
        out.add(text.slice(i, end + 2), "comment");
        i = end + 2;
      } else if (c === 34 || c === 39) {
        const end = stringEnd(i);
        out.add(text.slice(i, end), "string");
        i = end;
      } else if (atParams || !inDeclarations()) {
        rules(c);
      } else if (inValue) {
        value(c);
      } else {
        statement(c);
      }
      if (i === before) {
        // Safety net: always make progress.
        out.add(text.charAt(i));
        i++;
      }
    }
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
