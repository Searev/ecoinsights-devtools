/**
 * US-020: contract of the syntax colouring of the text preview (ARCH-DECISION-025). Types and tiny
 * pure helpers only, so that importing it never pulls the tokenizers: they live in `./index.ts`,
 * which the text preview loads with a dynamic `import()` (a separate chunk).
 */
import { TextPreviewType } from "../../../../domain/models/best-practice";

/** Languages the viewer colours. Anything else is shown as plain text. */
export type TextLanguage = "javascript" | "json" | "css" | "markup";

/**
 * Coloured token kinds. Text outside any token (punctuation, whitespace, identifiers) has no kind
 * and keeps the default text colour.
 * - every language: `comment`, `string`, `number`;
 * - JavaScript: `keyword`, `literal` (`true`, `false`, `null`, `undefined`, `NaN`, `Infinity`);
 *   regular expressions and template literals are `string`;
 * - JSON: `key` (object member names), `string` (string values), `number`, `literal`;
 * - CSS: `selector`, `property`, `value`, `keyword` (at-rules such as `@media`, `!important`),
 *   plus `string`, `number` and `comment`;
 * - markup (HTML, SVG, XML): `tag` (tag names, `<`, `</`, `>`, `/>` included), `attr-name`,
 *   `attr-value` (quotes included), `keyword` (doctype, `<?xml … ?>`), `string` (CDATA), and
 *   `comment`. The content of `<script>` and `<style>` is coloured as JavaScript and CSS.
 */
export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "literal"
  | "key"
  | "selector"
  | "property"
  | "value"
  | "tag"
  | "attr-name"
  | "attr-value";

/** One piece of a line. Invariant: the `text`s of a line's tokens, joined, equal the line exactly. */
export interface LineToken {
  text: string;
  /** Undefined: default text colour. */
  kind?: TokenKind;
}

/**
 * Stateful, line-by-line highlighter: call `line()` once per line, in order, from the first line.
 * The state (open comment, string, tag, embedded script…) carries from one line to the next. Lines
 * never contain a line break. Never throws on any input; linear in the line length.
 */
export interface LineHighlighter {
  line(text: string): LineToken[];
}

/** Signature of `createLineHighlighter` in `./index.ts`, for injection and lazy loading. */
export type CreateLineHighlighter = (language: TextLanguage) => LineHighlighter;

/** US-020 §2: the language comes from the line's type (HTML and SVG are markup). */
export function textLanguage(type: TextPreviewType): TextLanguage {
  switch (type) {
    case "JS":
      return "javascript";
    case "JSON":
      return "json";
    case "CSS":
      return "css";
    case "HTML":
    case "SVG":
      return "markup";
  }
}

/** CSS class of a token span (`text-view.css` gives each class its colour). */
export function tokenClass(kind: TokenKind): string {
  return `syntax-${kind}`;
}

/** CSS custom property holding the colour of a token kind (`syntax-palette.ts` sets them). */
export function tokenColourVariable(kind: TokenKind): string {
  return `--syntax-${kind}`;
}
