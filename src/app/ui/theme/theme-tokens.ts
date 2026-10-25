/**
 * US-030 (ARCH-DECISION-034): the colour tokens of both themes, defined once. Loaded by
 * `tailwind.config.ts` through jiti: relative imports only, no Solid, no browser globals.
 */
import type { ResolvedTheme, ThemePalette, ThemeTokenName } from "./theme-types";

export const THEME_TOKENS: Readonly<Record<ResolvedTheme, ThemePalette>> = {
  dark: {
    background: "#282828",
    surface: "#3c3c3c",
    surfaceLight: "#505050",
    onsurface: "#bfc6ce",
    strong: "#ffffff",
    border: "#474747",
    field: "#e5e7eb",
    // Tailwind gray-400 (#9ca3af) today, 4.34:1 on surface: lightened to 4.60:1 (US-030, plan §1.3).
    placeholder: "#a1a8b2",
    focus: "#ffffff",
    btn: "#1534ba",
    btnHover: "#2c3f71",
    onBtn: "#ffffff",
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
  },
  light: {
    background: "#ffffff",
    surface: "#f3f4f6",
    surfaceLight: "#e5e7eb",
    onsurface: "#374151",
    strong: "#111827",
    border: "#d1d5db",
    field: "#6b7280",
    placeholder: "#5b6472",
    focus: "#1534ba",
    btn: "#1534ba",
    btnHover: "#2c3f71",
    onBtn: "#ffffff",
    tableEven: "#f3f4f6",
    tableOdd: "#e5e7eb",
    danger: "#dc2626",
    dangerStrong: "#dc2626",
    dangerHover: "#991b1b",
    warning: "#92400e",
    tooltip: "#374151",
    onTooltip: "#ffffff",
    selected: "#4a69bd",
    selectedHover: "#3b5497",
    onSelected: "#ffffff",
    chip: "#4b5563",
    onChip: "#ffffff",
    iconMuted: "#6b7280",
    loader: "#3f51b5",
    marker: "#111827",
    complianceA: "#15803d",
    complianceB: "#a16207",
    complianceC: "#dc2626",
    complianceNone: "#6b7280",
    chartText: "#374151",
    chartGrid: "#d1d5db",
    chartLine: "#1d4ed8",
  },
};

/** `dialog::backdrop` does not inherit custom properties before Chrome 122, so it is not a token. */
export const THEME_BACKDROPS: Readonly<Record<ResolvedTheme, string>> = {
  dark: "rgba(0, 0, 0, 0.8)",
  light: "rgba(0, 0, 0, 0.4)",
};

/** `surfaceLight` -> `--color-surface-light`, `complianceA` -> `--color-compliance-a`. */
export function tokenVariable(name: ThemeTokenName): string {
  return `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** `#3c3c3c` -> `60 60 60`, the form `rgb(var(--color-x) / <alpha-value>)` expects. */
export function hexToChannels(hex: string): string {
  const digits = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)).join(" ");
}
