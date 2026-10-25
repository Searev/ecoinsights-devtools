import { describe, expect, it } from "vitest";
import { RESOLVED_THEMES, ResolvedTheme } from "../../../theme/theme-types";
import {
  SYNTAX_PALETTE,
  SYNTAX_PALETTES,
  TEXT_VIEW_BACKGROUND,
  TEXT_VIEW_GUTTER,
  TEXT_VIEW_TEXT,
  contrastRatio,
  syntaxThemeVariables,
} from "./syntax-palette";
import { TokenKind, tokenColourVariable } from "./syntax-types";

const KINDS = Object.keys(SYNTAX_PALETTES.dark.tokens) as TokenKind[];

function distance(a: string, b: string): number {
  const c = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

describe("contrastRatio", () => {
  it("is 21 between black and white, and 1 for equal colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("accepts three-digit hex colours", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
  });
});

const HEX = /^#[0-9a-f]{6}$/;

describe.each(RESOLVED_THEMES)("%s palette", (theme: ResolvedTheme) => {
  const p = SYNTAX_PALETTES[theme];

  it("has a lowercase #rrggbb colour for every token kind and for the chrome", () => {
    expect([...KINDS].sort()).toEqual(
      [
        "attr-name", "attr-value", "comment", "key", "keyword", "literal", "number", "property",
        "selector", "string", "tag", "value",
      ].sort(),
    );
    for (const kind of KINDS) expect(p.tokens[kind]).toMatch(HEX);
    for (const c of [p.background, p.text, p.gutter, p.focus]) expect(c).toMatch(HEX);
  });

  it.each(KINDS)("%s has a contrast of at least 4.5:1", (kind) => {
    expect(contrastRatio(p.tokens[kind], p.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the text and the gutter a contrast of at least 4.5:1 and the focus ring 3:1", () => {
    expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.gutter, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.focus, p.background)).toBeGreaterThanOrEqual(3);
  });

  it("makes comments clearly distinct from the text and from every other kind", () => {
    expect(distance(p.tokens.comment, p.text)).toBeGreaterThan(60);
    for (const kind of KINDS.filter((k) => k !== "comment")) {
      expect(distance(p.tokens.comment, p.tokens[kind])).toBeGreaterThan(60);
    }
  });

  it.each([
    ["string", "keyword", "number"],
    ["tag", "attr-name", "attr-value"],
    ["selector", "property", "value"],
    ["key", "string", "literal"],
  ] as const)("keeps %s, %s and %s apart", (a, b, c) => {
    for (const [x, y] of [[a, b], [a, c], [b, c]] as const) {
      expect(distance(p.tokens[x], p.tokens[y])).toBeGreaterThan(40);
    }
  });

  it("keeps every kind apart from the default text colour", () => {
    for (const kind of KINDS) expect(distance(p.tokens[kind], p.text)).toBeGreaterThan(25);
  });

  it("exposes exactly the 16 custom properties", () => {
    const vars = syntaxThemeVariables(theme);
    expect(Object.keys(vars).sort()).toEqual(
      [
        ...KINDS.map(tokenColourVariable),
        "--text-view-background", "--text-view-text", "--text-view-gutter", "--text-view-focus",
      ].sort(),
    );
    for (const kind of KINDS) expect(vars[tokenColourVariable(kind)]).toBe(p.tokens[kind]);
    expect(vars["--text-view-background"]).toBe(p.background);
    expect(vars["--text-view-text"]).toBe(p.text);
    expect(vars["--text-view-gutter"]).toBe(p.gutter);
    expect(vars["--text-view-focus"]).toBe(p.focus);
  });
});

describe("palette values", () => {
  it("keeps the dark palette exactly as it was", () => {
    expect(SYNTAX_PALETTES.dark).toEqual({
      background: "#282828",
      text: "#d4d4d4",
      gutter: "#9a9a9a",
      focus: "#9cdcfe",
      tokens: {
        comment: "#7fbf7f", string: "#e8a87c", number: "#f4d06f", keyword: "#d291d0",
        literal: "#7ab8f5", key: "#8fe0e8", selector: "#f07178", property: "#9cdcfe",
        value: "#b6a6f0", tag: "#f07178", "attr-name": "#9cdcfe", "attr-value": "#e8a87c",
      },
    });
  });

  it("uses the light background token for the light palette", () => {
    expect(SYNTAX_PALETTES.light.background).toBe("#ffffff");
  });

  it("keeps the dark aliases", () => {
    expect(TEXT_VIEW_BACKGROUND).toBe("#282828");
    expect(TEXT_VIEW_TEXT).toBe("#d4d4d4");
    expect(TEXT_VIEW_GUTTER).toBe("#9a9a9a");
    expect(SYNTAX_PALETTE).toEqual(SYNTAX_PALETTES.dark.tokens);
  });
});
