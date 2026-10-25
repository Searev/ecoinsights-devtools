import {
  applyResolvedTheme,
  parseThemeMode,
  readStoredMode,
  resolveTheme,
  writeStoredMode,
} from "./theme-mode";
import {
  ColorSchemeQuery,
  ResolvedTheme,
  StorageEventSource,
  THEME_STORAGE_KEY,
  ThemeMode,
  ThemeRoot,
  ThemeStorage,
} from "./theme-types";

export interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

export interface ThemeControllerDeps {
  storage?: ThemeStorage;
  query?: ColorSchemeQuery;
  root?: ThemeRoot;
  events?: StorageEventSource;
}

export interface ThemeController {
  state(): ThemeState;
  setMode(mode: ThemeMode): void;
  subscribe(listener: (state: ThemeState) => void): () => void;
  dispose(): void;
}

/**
 * Single source of truth of the theme (ARCH-DECISION-034/035). Every dependency is optional: without
 * a query `system` resolves to dark, without a root nothing is applied, without storage the mode
 * only lives for the session.
 */
export function createThemeController(deps: ThemeControllerDeps): ThemeController {
  const { storage, query, root, events } = deps;
  const listeners = new Set<(state: ThemeState) => void>();

  const resolve = (mode: ThemeMode): ResolvedTheme => resolveTheme(mode, query?.matches ?? false);

  let current: ThemeState = (() => {
    const mode = readStoredMode(storage);
    return { mode, resolved: resolve(mode) };
  })();
  if (root) applyResolvedTheme(root, current.resolved);

  /** Applies and notifies, only when something changed. */
  function update(mode: ThemeMode): void {
    const next: ThemeState = { mode, resolved: resolve(mode) };
    if (next.mode === current.mode && next.resolved === current.resolved) return;
    current = next;
    if (root) applyResolvedTheme(root, next.resolved);
    [...listeners].forEach((listener) => listener(next));
  }

  const onQueryChange = (): void => {
    if (current.mode === "system") update("system");
  };
  const onStorage = (event: { key: string | null; newValue: string | null }): void => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    update(parseThemeMode(event.newValue));
  };

  query?.addEventListener("change", onQueryChange);
  events?.addEventListener("storage", onStorage);

  return {
    state: () => current,
    setMode(mode) {
      if (mode === current.mode) return;
      writeStoredMode(storage, mode);
      update(mode);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      query?.removeEventListener("change", onQueryChange);
      events?.removeEventListener("storage", onStorage);
      listeners.clear();
    },
  };
}
