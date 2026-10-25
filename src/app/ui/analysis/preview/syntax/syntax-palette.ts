/**
 * US-020 / US-030: colours of the text preview for each resolved theme (ARCH-DECISION-025, 034).
 * Every token, the text and the gutter have a contrast of at least 4.5:1 against the palette
 * background, and the focus ring 3:1 (tested). The palettes become CSS custom properties through
 * `syntaxThemeVariables`, injected in the global stylesheet. This module is imported statically by
 * the text body and by `tailwind.config.ts` (jiti): relative imports only, no browser globals, and
 * it must not import the tokenizers.
 */
import { ResolvedTheme } from "../../../theme/theme-types";
import { contrastRatio } from "../../../theme/contrast";
import { TokenKind, tokenColourVariable } from "./syntax-types";

export { contrastRatio };

export interface SyntaxThemePalette {
  background: string;
  text: string;
  gutter: string;
  focus: string;
  tokens: Record<TokenKind, string>;
}

export const SYNTAX_PALETTES: Readonly<Record<ResolvedTheme, SyntaxThemePalette>> = {
  dark: {
    background: "#282828",
    text: "#d4d4d4",
    gutter: "#9a9a9a",
    focus: "#9cdcfe",
    tokens: {
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
    },
  },
  light: {
    background: "#ffffff",
    text: "#24292f",
    gutter: "#6e7781",
    focus: "#0969da",
    tokens: {
      comment: "#1a7f37",
      string: "#0a3069",
      number: "#b35900",
      keyword: "#cf222e",
      literal: "#0550ae",
      key: "#0b7285",
      selector: "#8250df",
      property: "#0550ae",
      value: "#953800",
      tag: "#a31515",
      "attr-name": "#0550ae",
      "attr-value": "#0a3069",
    },
  },
};

/** Dark aliases, kept for the tests and the callers that only know the dark theme. */
export const TEXT_VIEW_BACKGROUND = SYNTAX_PALETTES.dark.background;
export const TEXT_VIEW_TEXT = SYNTAX_PALETTES.dark.text;
export const TEXT_VIEW_GUTTER = SYNTAX_PALETTES.dark.gutter;
export const SYNTAX_PALETTE: Record<TokenKind, string> = SYNTAX_PALETTES.dark.tokens;

/** The 16 custom properties of a theme: `--syntax-<kind>` and `--text-view-*`. */
export function syntaxThemeVariables(theme: ResolvedTheme): Record<string, string> {
  const palette = SYNTAX_PALETTES[theme];
  const variables: Record<string, string> = {};
  for (const kind of Object.keys(palette.tokens) as TokenKind[]) {
    variables[tokenColourVariable(kind)] = palette.tokens[kind];
  }
  variables["--text-view-background"] = palette.background;
  variables["--text-view-text"] = palette.text;
  variables["--text-view-gutter"] = palette.gutter;
  variables["--text-view-focus"] = palette.focus;
  return variables;
}
