/**
 * US-020: colours of the text preview, for the panel's single dark theme (ARCH-DECISION-025).
 * Every colour has a contrast of at least 4.5:1 against `TEXT_VIEW_BACKGROUND` (tested). This module
 * is imported statically by the text body, so it must not import the tokenizers.
 */
import { TokenKind, tokenColourVariable } from "./syntax-types";

/** Background of the content block (Tailwind `background`). */
export const TEXT_VIEW_BACKGROUND = "#282828";
/** Default text colour. */
export const TEXT_VIEW_TEXT = "#d4d4d4";
/** Line numbers. */
export const TEXT_VIEW_GUTTER = "#9a9a9a";

export const SYNTAX_PALETTE: Record<TokenKind, string> = {
  comment: "#7fbf7f",
  string: "#e8a87c",
  number: "#f4d06f",
  keyword: "#d291d0",
  literal: "#7ab8f5",
  key: "#8fe0e8",
  selector: "#f07178",
  property: "#9cdcfe",
  value: "#b6a6f0",
  tag: "#f07178",
  "attr-name": "#9cdcfe",
  "attr-value": "#e8a87c",
};

/** Custom properties (`--syntax-<kind>`) to set on the content block. */
export function syntaxStyleVariables(): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const kind of Object.keys(SYNTAX_PALETTE) as TokenKind[]) {
    variables[tokenColourVariable(kind)] = SYNTAX_PALETTE[kind];
  }
  return variables;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  let digits = hex.replace("#", "");
  if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(digits.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` (or `#rgb`) colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
