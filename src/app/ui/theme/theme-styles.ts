/**
 * US-030 (ARCH-DECISION-034): Tailwind colour map and the `addBase` object emitting the theme
 * custom properties. Loaded by `tailwind.config.ts` through jiti: relative imports only.
 */
import { THEME_BACKDROPS, THEME_TOKENS, hexToChannels, tokenVariable } from "./theme-tokens";
import { THEME_TOKEN_NAMES, type ResolvedTheme, type ThemeTokenName } from "./theme-types";

/** Tailwind colours: `rgb(var(--color-x) / <alpha-value>)` so opacity modifiers keep working. */
export function tailwindThemeColours(): Record<ThemeTokenName, string> {
  return Object.fromEntries(
    THEME_TOKEN_NAMES.map((name) => [name, `rgb(var(${tokenVariable(name)}) / <alpha-value>)`]),
  ) as Record<ThemeTokenName, string>;
}

type Extra = Partial<Record<ResolvedTheme, Record<string, string>>>;

function themeBlock(theme: ResolvedTheme, extra: Extra): Record<string, string> {
  const block: Record<string, string> = {};
  for (const name of THEME_TOKEN_NAMES) {
    block[tokenVariable(name)] = hexToChannels(THEME_TOKENS[theme][name]);
  }
  return { ...block, ...extra[theme], "color-scheme": theme };
}

/**
 * The object passed to Tailwind's `addBase`. Dark is the default (no attribute, no JavaScript); the
 * system preference switches to light unless `data-theme="dark"`; `data-theme="light"` forces light.
 */
export function themeBaseStyles(extra: Extra = {}): Record<string, unknown> {
  const dark = themeBlock("dark", extra);
  const light = themeBlock("light", extra);
  const lightBackdrop = { "background-color": THEME_BACKDROPS.light };
  const notDark = ':root:not([data-theme="dark"])';
  const forcedLight = ':root[data-theme="light"]';
  return {
    ":root": dark,
    "@media (prefers-color-scheme: light)": {
      [notDark]: light,
      [`${notDark} dialog::backdrop`]: lightBackdrop,
    },
    [forcedLight]: light,
    "dialog::backdrop": { "background-color": THEME_BACKDROPS.dark },
    [`${forcedLight} dialog::backdrop`]: lightBackdrop,
  };
}
