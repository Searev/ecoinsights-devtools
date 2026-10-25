import {
  DEFAULT_THEME_MODE,
  ResolvedTheme,
  THEME_ATTRIBUTE,
  THEME_MODES,
  THEME_STORAGE_KEY,
  ThemeMode,
  ThemeRoot,
  ThemeStorage,
} from "./theme-types";

/** Anything unknown (null, "blue", "Light", numbers, objects) is the default mode, `system`. */
export function parseThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.find((mode) => mode === value) ?? DEFAULT_THEME_MODE;
}

/** `system` follows the OS preference (light only when it asks for it); forced modes win. */
export function resolveTheme(mode: ThemeMode, systemPrefersLight: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersLight ? "light" : "dark";
  return mode;
}

/** Never throws: a missing or failing storage gives the default mode. */
export function readStoredMode(storage: ThemeStorage | undefined): ThemeMode {
  try {
    return parseThemeMode(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

/** Never throws; returns false when the mode could not be stored. */
export function writeStoredMode(storage: ThemeStorage | undefined, mode: ThemeMode): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** Reading `window.localStorage` itself can throw (storage disabled), hence the getter. */
export function safeStorage(getter: () => ThemeStorage | null | undefined): ThemeStorage | undefined {
  try {
    return getter() ?? undefined;
  } catch {
    return undefined;
  }
}

export function applyResolvedTheme(root: ThemeRoot, theme: ResolvedTheme): void {
  root.setAttribute(THEME_ATTRIBUTE, theme);
}
