import { Accessor, createContext, createSignal, JSX, onCleanup, untrack, useContext } from "solid-js";
import { ThemeController } from "./theme-controller";
import { ResolvedTheme, ThemeMode } from "./theme-types";

export interface ThemeContextValue {
  mode: Accessor<ThemeMode>;
  resolved: Accessor<ResolvedTheme>;
  setMode(mode: ThemeMode): void;
}

const ThemeContext = createContext<ThemeContextValue>();

export function ThemeProvider(props: { controller: ThemeController; children: JSX.Element }): JSX.Element {
  // The controller is fixed for the provider lifetime: read it once, untracked.
  const controller = untrack(() => props.controller);
  const [state, setState] = createSignal(controller.state());
  const unsubscribe = controller.subscribe(setState);
  onCleanup(unsubscribe);

  const value: ThemeContextValue = {
    mode: () => state().mode,
    resolved: () => state().resolved,
    setMode: (mode) => controller.setMode(mode),
  };
  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return theme;
}
