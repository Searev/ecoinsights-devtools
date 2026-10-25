import { applyResolvedTheme, readStoredMode, resolveTheme, safeStorage } from "./theme-mode";
import { LIGHT_SCHEME_QUERY, ResolvedTheme, ThemeRoot, ThemeStorage } from "./theme-types";

export interface ThemeBootEnv {
  localStorage?: unknown;
  matchMedia?: (query: string) => { matches: boolean };
  document: { documentElement: ThemeRoot };
}

/**
 * Pre-paint boot (ARCH-DECISION-035): sets `<html data-theme>` from the stored mode. Bundled alone
 * into a tiny classic script, so it imports nothing but the theme modules. Never throws.
 */
export function bootTheme(env: ThemeBootEnv): ResolvedTheme | undefined {
  try {
    const storage = safeStorage(() => env.localStorage as ThemeStorage | null | undefined);
    let prefersLight = false;
    try {
      prefersLight = env.matchMedia?.(LIGHT_SCHEME_QUERY).matches === true;
    } catch {
      prefersLight = false;
    }
    const theme = resolveTheme(readStoredMode(storage), prefersLight);
    applyResolvedTheme(env.document.documentElement, theme);
    return theme;
  } catch {
    return undefined;
  }
}
