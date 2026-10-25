import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { CONTRAST_REQUIREMENTS, DARK_CONTRAST_EXCEPTIONS } from "./contrast-requirements";
import { THEME_TOKENS } from "./theme-tokens";
import { THEME_TOKEN_NAMES } from "./theme-types";

const isException = (fg: string, bg: string) =>
  DARK_CONTRAST_EXCEPTIONS.some((e) => e.foreground === fg && e.background === bg);

function ratio(theme: "dark" | "light", fg: keyof typeof THEME_TOKENS.dark, bg: keyof typeof THEME_TOKENS.dark) {
  return contrastRatio(THEME_TOKENS[theme][fg], THEME_TOKENS[theme][bg]);
}

describe("theme contrast (scenario 10)", () => {
  it.each(CONTRAST_REQUIREMENTS.map((r) => [`${r.foreground} on ${r.background}`, r] as const))(
    "light: %s",
    (_label, r) => {
      expect(ratio("light", r.foreground, r.background)).toBeGreaterThanOrEqual(r.minimum);
    },
  );

  it.each(CONTRAST_REQUIREMENTS.map((r) => [`${r.foreground} on ${r.background}`, r] as const))(
    "dark: %s (unless a documented exception)",
    (_label, r) => {
      if (isException(r.foreground, r.background)) return;
      expect(ratio("dark", r.foreground, r.background)).toBeGreaterThanOrEqual(r.minimum);
    },
  );

  it("has no duplicated requirement and a usage for each", () => {
    const keys = CONTRAST_REQUIREMENTS.map((r) => `${r.foreground}/${r.background}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of CONTRAST_REQUIREMENTS) expect(r.usage.length).toBeGreaterThan(3);
  });

  it("lists every mandatory text pair at 4.5", () => {
    const text = (fg: string, bgs: string[]) =>
      bgs.forEach((bg) =>
        expect(CONTRAST_REQUIREMENTS).toContainEqual(expect.objectContaining({ foreground: fg, background: bg, minimum: 4.5 })),
      );
    text("onsurface", ["background", "surface", "surfaceLight", "tableEven", "tableOdd"]);
    text("strong", ["background", "surface", "surfaceLight", "tableOdd"]);
    text("onBtn", ["btn", "btnHover", "dangerStrong", "dangerHover"]);
    text("onSelected", ["selected", "selectedHover"]);
    text("onTooltip", ["tooltip"]);
    text("onChip", ["chip"]);
    text("warning", ["surface", "background"]);
    text("chartText", ["background", "surface"]);
  });

  describe("dark exceptions", () => {
    it.each(DARK_CONTRAST_EXCEPTIONS.map((e) => [`${e.foreground} on ${e.background}`, e] as const))(
      "%s really fails in dark, is a requirement, is non-text and explained",
      (_label, e) => {
        const req = CONTRAST_REQUIREMENTS.find((r) => r.foreground === e.foreground && r.background === e.background);
        expect(req).toBeDefined();
        expect(req!.minimum).toBe(3);
        expect(ratio("dark", e.foreground, e.background)).toBeLessThan(req!.minimum);
        expect(e.reason.length).toBeGreaterThan(3);
      },
    );

    it("are exactly the five expected pairs", () => {
      expect(DARK_CONTRAST_EXCEPTIONS.map((e) => `${e.foreground}/${e.background}`).sort()).toEqual(
        [
          "btn/background",
          "btn/surface",
          "complianceC/surface",
          "complianceNone/surface",
          "loader/background",
        ].sort(),
      );
    });
  });

  it("covers every token except the decorative border and chartGrid", () => {
    const used = new Set<string>();
    for (const r of CONTRAST_REQUIREMENTS) {
      used.add(r.foreground);
      used.add(r.background);
    }
    const missing = THEME_TOKEN_NAMES.filter((n) => !used.has(n) && n !== "border" && n !== "chartGrid");
    expect(missing).toEqual([]);
  });
});
