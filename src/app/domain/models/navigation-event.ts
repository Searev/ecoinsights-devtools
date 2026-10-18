/**
 * Something happened in the inspected tab that may start a new Page analysis.
 * - `url-changed`: the tab URL changed (full navigation or SPA history change)
 * - `link-clicked` / `form-submitted`: navigation intents reported by the Probe
 */
export type NavigationEvent =
  | { kind: "url-changed"; url: string }
  | { kind: "link-clicked"; url: string }
  | { kind: "form-submitted"; url: string };
