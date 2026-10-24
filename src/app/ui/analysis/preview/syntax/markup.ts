/**
 * US-020: line-based, stateful HTML / SVG / XML tokenizer (ARCH-DECISION-025). Tracks comments,
 * CDATA, declarations, tags that span lines and quoted attribute values across lines. The content of
 * `<script>` and `<style>` is delegated to the JavaScript, JSON and CSS highlighters until the
 * closing tag. File text is only ever classified, never interpreted. Linear time, never throws.
 */
import { createCssHighlighter } from "./css";
import { createJavaScriptHighlighter } from "./javascript";
import { createJsonHighlighter } from "./json";
import type { LineHighlighter, LineToken, TokenKind } from "./syntax-types";
import { TokenBuilder, isAsciiLetter, isSpace, lowerAscii } from "./token-builder";

type Mode = "text" | "comment" | "cdata" | "directive" | "pi" | "tag" | "raw";

const MAX_CAPTURE = 64;

/** Multi-line constructs: the terminator and the kind of the whole construct. */
const SPANS: Record<"comment" | "cdata" | "directive" | "pi", { end: string; kind: TokenKind }> = {
  comment: { end: "-->", kind: "comment" },
  cdata: { end: "]]>", kind: "string" },
  directive: { end: ">", kind: "keyword" },
  pi: { end: "?>", kind: "keyword" },
};

function scriptHighlighter(type: string | undefined): LineHighlighter | undefined {
  const t = (type ?? "").trim().toLowerCase();
  if (t === "" || t === "module" || t.includes("javascript") || t.includes("ecmascript")) {
    return createJavaScriptHighlighter();
  }
  if (t.includes("json") || t === "importmap" || t === "speculationrules") return createJsonHighlighter();
  return undefined;
}

function styleHighlighter(type: string | undefined): LineHighlighter | undefined {
  const t = (type ?? "").trim().toLowerCase();
  return t === "" || t === "text/css" ? createCssHighlighter() : undefined;
}

/** Whether `text` has `</name` (case-insensitive) followed by a delimiter at `at`. */
function closesRaw(text: string, at: number, name: string): boolean {
  if (text.charCodeAt(at + 1) !== 47) return false;
  for (let k = 0; k < name.length; k++) {
    if (lowerAscii(text.charCodeAt(at + 2 + k)) !== name.charCodeAt(k)) return false;
  }
  const after = at + 2 + name.length;
  if (after >= text.length) return true;
  const c = text.charCodeAt(after);
  return isSpace(c) || c === 47 || c === 62;
}

export function createMarkupHighlighter(): LineHighlighter {
  let mode: Mode = "text";
  // Tag state.
  let tagName = "";
  let closing = false;
  let quote = 0;
  let expectValue = false;
  let attrName = "";
  let valueBuf = "";
  let typeValue: string | undefined;
  // Raw text (script / style) state.
  let rawTag = "";
  let sub: LineHighlighter | undefined;

  function scan(text: string): LineToken[] {
    const out = new TokenBuilder();
    const n = text.length;
    let i = 0;

    const lowerName = (from: number, to: number): string => text.slice(from, Math.min(to, from + 16)).toLowerCase();

    /** Continues or starts a construct that ends at `terminator`; `from` is where to look from. */
    const span = (kind: keyof typeof SPANS, start: number, from: number): void => {
      const { end, kind: tokenKind } = SPANS[kind];
      const at = text.indexOf(end, from);
      if (at < 0) {
        out.add(text.slice(start), tokenKind);
        mode = kind;
        i = n;
      } else {
        out.add(text.slice(start, at + end.length), tokenKind);
        mode = "text";
        i = at + end.length;
      }
    };

    const finishValue = (): void => {
      if (attrName === "type") typeValue = valueBuf.trim();
      valueBuf = "";
    };

    const endTag = (selfClosing: boolean): void => {
      mode = "text";
      expectValue = false;
      quote = 0;
      if (!closing && !selfClosing && (tagName === "script" || tagName === "style")) {
        rawTag = tagName;
        sub = tagName === "script" ? scriptHighlighter(typeValue) : styleHighlighter(typeValue);
        mode = "raw";
      }
    };

    const startTag = (at: number, nameFrom: number, isClosing: boolean): void => {
      let j = nameFrom;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (isSpace(c) || c === 47 || c === 62) break;
        j++;
      }
      out.add(text.slice(at, j), "tag");
      tagName = lowerName(nameFrom, j);
      closing = isClosing;
      quote = 0;
      expectValue = false;
      attrName = "";
      valueBuf = "";
      typeValue = undefined;
      mode = "tag";
      i = j;
    };

    const delegate = (segment: string): void => {
      if (segment.length === 0) return;
      if (!sub) {
        out.add(segment);
        return;
      }
      let tokens: LineToken[];
      let total = 0;
      try {
        tokens = sub.line(segment);
        for (const t of tokens) total += t.text.length;
      } catch {
        tokens = [];
        total = -1;
      }
      if (total !== segment.length) {
        out.add(segment);
        return;
      }
      for (const t of tokens) out.add(t.text, t.kind);
    };

    while (i < n) {
      if (mode === "comment" || mode === "cdata" || mode === "directive" || mode === "pi") {
        span(mode, i, i);
      } else if (mode === "raw") {
        let p = text.indexOf("<", i);
        while (p >= 0 && !closesRaw(text, p, rawTag)) p = text.indexOf("<", p + 1);
        if (p < 0) {
          delegate(text.slice(i));
          i = n;
        } else {
          delegate(text.slice(i, p));
          i = p;
          mode = "text";
          sub = undefined;
        }
      } else if (mode === "tag") {
        if (quote !== 0) {
          const k = text.indexOf(String.fromCharCode(quote), i);
          const end = k < 0 ? n : k + 1;
          if (valueBuf.length < MAX_CAPTURE) valueBuf += text.slice(i, k < 0 ? n : k).slice(0, MAX_CAPTURE);
          out.add(text.slice(i, end), "attr-value");
          if (k >= 0) {
            quote = 0;
            finishValue();
          }
          i = end;
          continue;
        }
        const c = text.charCodeAt(i);
        if (isSpace(c)) {
          let j = i + 1;
          while (j < n && isSpace(text.charCodeAt(j))) j++;
          out.add(text.slice(i, j));
          i = j;
        } else if (c === 62) {
          out.add(">", "tag");
          i++;
          endTag(false);
        } else if (c === 47) {
          if (text.charCodeAt(i + 1) === 62) {
            out.add("/>", "tag");
            i += 2;
            endTag(true);
          } else {
            out.add("/");
            i++;
          }
        } else if (c === 61) {
          out.add("=");
          expectValue = true;
          i++;
        } else if (c === 34 || c === 39) {
          quote = c;
          valueBuf = "";
          expectValue = false;
          out.add(text.charAt(i), "attr-value");
          i++;
        } else if (expectValue) {
          let j = i + 1;
          while (j < n) {
            const d = text.charCodeAt(j);
            if (isSpace(d) || d === 62) break;
            j++;
          }
          valueBuf = text.slice(i, Math.min(j, i + MAX_CAPTURE));
          out.add(text.slice(i, j), "attr-value");
          expectValue = false;
          finishValue();
          i = j;
        } else {
          let j = i + 1;
          while (j < n) {
            const d = text.charCodeAt(j);
            if (isSpace(d) || d === 61 || d === 62 || d === 47 || d === 34 || d === 39) break;
            j++;
          }
          attrName = lowerName(i, j);
          out.add(text.slice(i, j), "attr-name");
          i = j;
        }
      } else {
        const lt = text.indexOf("<", i);
        if (lt < 0) {
          out.add(text.slice(i));
          i = n;
          continue;
        }
        out.add(text.slice(i, lt));
        i = lt;
        const next = text.charCodeAt(lt + 1);
        if (next === 33) {
          if (text.startsWith("<!--", lt)) span("comment", lt, lt + 4);
          else if (text.startsWith("<![CDATA[", lt)) span("cdata", lt, lt + 9);
          else span("directive", lt, lt + 2);
        } else if (next === 63) {
          span("pi", lt, lt + 2);
        } else if (next === 47 && isAsciiLetter(text.charCodeAt(lt + 2))) {
          startTag(lt, lt + 2, true);
        } else if (isAsciiLetter(next)) {
          startTag(lt, lt + 1, false);
        } else {
          out.add("<");
          i = lt + 1;
        }
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
