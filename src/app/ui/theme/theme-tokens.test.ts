import { describe, expect, it } from "vitest";
import { THEME_TOKEN_NAMES } from "./theme-types";
import { THEME_BACKDROPS, THEME_TOKENS, hexToChannels, tokenVariable } from "./theme-tokens";

describe("THEME_TOKENS", () => {
  it.each(["dark", "light"] as const)("%s palette has exactly the token names, as lowercase #rrggbb", (theme) => {
    expect(Object.keys(THEME_TOKENS[theme]).sort()).toEqual([...THEME_TOKEN_NAMES].sort());
    for (const value of Object.values(THEME_TOKENS[theme])) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the dark palette exactly as specified", () => {
    expect(THEME_TOKENS.dark).toEqual({
      background: "#282828",
      surface: "#3c3c3c",
      surfaceLight: "#505050",
      onsurface: "#bfc6ce",
      strong: "#ffffff",
      border: "#474747",
      field: "#e5e7eb",
      focus: "#ffffff",
      btn: "#1534ba",
      btnHover: "#2c3f71",
      onBtn: "#ffffff",
      placeholder: "#a1a8b2",
      tableEven: "#28292a",
      tableOdd: "#1f1f1f",
      danger: "#ef4444",
      dangerStrong: "#dc2626",
      dangerHover: "#991b1b",
      warning: "#eab308",
      tooltip: "#555555",
      onTooltip: "#ffffff",
      selected: "#4a69bd",
      selectedHover: "#3b5497",
      onSelected: "#ffffff",
      chip: "#6b7280",
      onChip: "#ffffff",
      iconMuted: "#787878",
      loader: "#3f51b5",
      marker: "#ffffff",
      complianceA: "#22c55e",
      complianceB: "#eab308",
      complianceC: "#ef4444",
      complianceNone: "#6b7280",
      chartText: "#bfc6ce",
      chartGrid: "#474747",
      chartLine: "#36a2eb",
    });
  });

  it("fixes the light background to white and keeps the brand button", () => {
    expect(THEME_TOKENS.light.background).toBe("#ffffff");
    expect(THEME_TOKENS.light.btn).toBe("#1534ba");
  });
});

describe("THEME_BACKDROPS", () => {
  it("keeps today's dark backdrop and defines a lighter one for light", () => {
    expect(THEME_BACKDROPS.dark).toBe("rgba(0, 0, 0, 0.8)");
    expect(THEME_BACKDROPS.light).toMatch(/^rgba\(0, 0, 0, 0\.\d+\)$/);
  });
});

describe("tokenVariable", () => {
  it.each([
    ["background", "--color-background"],
    ["surfaceLight", "--color-surface-light"],
    ["complianceA", "--color-compliance-a"],
    ["complianceNone", "--color-compliance-none"],
    ["onBtn", "--color-on-btn"],
  ] as const)("%s -> %s", (name, expected) => {
    expect(tokenVariable(name)).toBe(expected);
  });
});

describe("hexToChannels", () => {
  it("converts to space separated decimal channels", () => {
    expect(hexToChannels("#3c3c3c")).toBe("60 60 60");
    expect(hexToChannels("#1534ba")).toBe("21 52 186");
    expect(hexToChannels("#ffffff")).toBe("255 255 255");
  });
});
