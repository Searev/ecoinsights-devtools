import { describe, expect, it } from "vitest";
import {
  SYNTAX_PALETTE,
  TEXT_VIEW_BACKGROUND,
  TEXT_VIEW_GUTTER,
  TEXT_VIEW_TEXT,
  contrastRatio,
  syntaxStyleVariables,
} from "./syntax-palette";
import { TokenKind, tokenColourVariable } from "./syntax-types";

const KINDS = Object.keys(SYNTAX_PALETTE) as TokenKind[];

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

describe("palette", () => {
  it("uses the panel background", () => {
    expect(TEXT_VIEW_BACKGROUND).toBe("#282828");
  });

  it("has a hex colour for every token kind", () => {
    expect(KINDS.sort()).toEqual(
      [
        "attr-name", "attr-value", "comment", "key", "keyword", "literal", "number", "property",
        "selector", "string", "tag", "value",
      ].sort(),
    );
    for (const kind of KINDS) expect(SYNTAX_PALETTE[kind]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(KINDS)("%s has a contrast of at least 4.5:1", (kind) => {
    expect(contrastRatio(SYNTAX_PALETTE[kind], TEXT_VIEW_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the text and the gutter a contrast of at least 4.5:1", () => {
    expect(contrastRatio(TEXT_VIEW_TEXT, TEXT_VIEW_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TEXT_VIEW_GUTTER, TEXT_VIEW_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it("makes comments clearly distinct from the text and from every other kind", () => {
    expect(distance(SYNTAX_PALETTE.comment, TEXT_VIEW_TEXT)).toBeGreaterThan(60);
    for (const kind of KINDS.filter((k) => k !== "comment")) {
      expect(distance(SYNTAX_PALETTE.comment, SYNTAX_PALETTE[kind])).toBeGreaterThan(60);
    }
  });

  it.each([
    ["string", "keyword", "number"],
    ["tag", "attr-name", "attr-value"],
    ["selector", "property", "value"],
    ["key", "string", "literal"],
  ] as const)("keeps %s, %s and %s apart", (a, b, c) => {
    for (const [x, y] of [[a, b], [a, c], [b, c]] as const) {
      expect(distance(SYNTAX_PALETTE[x], SYNTAX_PALETTE[y])).toBeGreaterThan(40);
    }
  });

  it("keeps every kind apart from the default text colour", () => {
    for (const kind of KINDS) {
      expect(distance(SYNTAX_PALETTE[kind], TEXT_VIEW_TEXT)).toBeGreaterThan(25);
    }
  });
});

describe("syntaxStyleVariables", () => {
  it("covers every token kind with its custom property", () => {
    const vars = syntaxStyleVariables();
    expect(Object.keys(vars).sort()).toEqual(KINDS.map(tokenColourVariable).sort());
    for (const kind of KINDS) expect(vars[tokenColourVariable(kind)]).toBe(SYNTAX_PALETTE[kind]);
  });
});
