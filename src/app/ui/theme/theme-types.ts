/**
 * US-030: contract of the panel theme (ARCH-DECISION-034). Types and constants only, written by the
 * lead; the logic lives in `theme-mode.ts`, `theme-controller.ts` and `theme-tokens.ts`.
 *
 * This module is bundled into the pre-paint boot script and imported by `tailwind.config.ts`, so it
 * must stay free of imports and of browser globals.
 */

/** What the auditor chose in the "Thème" select. */
export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** The theme actually shown, after resolving `system` against `prefers-color-scheme`. */
export const RESOLVED_THEMES = ["dark", "light"] as const;
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

/** The mode used when nothing valid is stored. */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** The one `localStorage` key of the theme, separate from the analyses store. */
export const THEME_STORAGE_KEY = "ecoinsights.theme";

/** Attribute set on `<html>` to the resolved theme (`"light"` or `"dark"`). */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * Media query of the system preference. `system` resolves to light when it matches and to dark
 * otherwise (including "no preference"), exactly like the CSS fallback in `theme-styles.ts`.
 */
export const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

/** Labels of the "Thème" select, in display order (`THEME_MODES`). */
export const THEME_MODE_LABELS: Readonly<Record<ThemeMode, string>> = {
  system: "Système",
  light: "Clair",
  dark: "Sombre",
};

/**
 * Colour tokens of the panel. Each name is a Tailwind colour (`bg-<name>`, `text-<name>`,
 * `border-<name>`…) backed by the CSS custom property `--color-<kebab-name>`. Values are
 * `#rrggbb` per theme in `theme-tokens.ts`. See TECH-US-030-plan §1.2 for the usage of each.
 */
export const THEME_TOKEN_NAMES = [
  "background",
  "surface",
  "surfaceLight",
  "onsurface",
  "strong",
  "border",
  "field",
  "placeholder",
  "focus",
  "btn",
  "btnHover",
  "onBtn",
  "tableEven",
  "tableOdd",
  "danger",
  "dangerStrong",
  "dangerHover",
  "warning",
  "tooltip",
  "onTooltip",
  "selected",
  "selectedHover",
  "onSelected",
  "chip",
  "onChip",
  "iconMuted",
  "loader",
  "marker",
  "complianceA",
  "complianceB",
  "complianceC",
  "complianceNone",
  "chartText",
  "chartGrid",
  "chartLine",
] as const;
export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

/** One theme's colours: every token, as a lowercase `#rrggbb`. */
export type ThemePalette = Readonly<Record<ThemeTokenName, string>>;

/** Injected `localStorage`. Any call may throw (storage disabled, quota, private mode). */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Injected `MediaQueryList` of `LIGHT_SCHEME_QUERY`. */
export interface ColorSchemeQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

/** Injected `document.documentElement`. */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

/** Injected `window`, for the `storage` event fired by another panel of the extension. */
export interface StorageEventSource {
  addEventListener(type: "storage", listener: (event: { key: string | null; newValue: string | null }) => void): void;
  removeEventListener(type: "storage", listener: (event: { key: string | null; newValue: string | null }) => void): void;
}
