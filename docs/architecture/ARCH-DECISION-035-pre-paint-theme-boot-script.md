# ARCH-DECISION-035: A tiny external classic script, built from TypeScript by a Vite plugin, applies the theme before the first paint

- **Status:** Accepted (US-030)
- **Builds on:** [ARCH-DECISION-034](ARCH-DECISION-034-theme-tokens-css-variables.md), [005](ARCH-DECISION-005-per-target-build.md) (per-target build)

## Context

A user who forced `Clair` (or `Sombre` against the system) must never see the other theme flash when the panel opens. The extension pages' CSP is `script-src 'self' 'wasm-unsafe-eval'`, so the usual inline `<script>` in `<head>` is forbidden, and `scripts/manifest.test.mjs` must keep passing unchanged.

`prefers-color-scheme` handles `Système` in CSS alone. Only a forced mode needs the stored value, and that needs JavaScript before the first paint.

Options considered:

1. **Relax the CSP** with a hash or `'unsafe-inline'`. Rejected by the story.
2. **Apply the theme from the app module** (`index.tsx`). Rejected: module scripts are deferred, and the app bundle is large, so the browser may paint the default theme first.
3. **Hide the body until the app sets the theme.** Rejected: it trades a flash for a blank panel, and a script error leaves the panel invisible.
4. **A blocking classic script in `<head>`, served from the extension origin (chosen).** A parser-blocking `<script src>` runs before the body is parsed or painted, and `'self'` allows it.

## Decision

- `src/app/ui/theme/theme-boot.ts` exports `bootTheme(env)`. It reads `localStorage` (guarded: the getter or `getItem` may throw), parses the mode (unknown means `Système`), resolves it against `matchMedia("(prefers-color-scheme: light)")`, and sets `<html data-theme>`. It never throws. It uses the same `theme-mode.ts` functions as the controller, so boot and runtime cannot disagree. `theme-boot.entry.ts` calls it with `window`.
- `scripts/vite-theme-boot.mjs` is a Vite plugin:
  - `buildThemeBoot()` bundles the entry with esbuild into a minified IIFE of well under 2 kB;
  - in a build, `generateBundle` emits it as the asset `theme-boot.js` next to `index.html`;
  - in `npm run dev`, a middleware serves the same code at `/theme-boot.js`;
  - `transformIndexHtml` (`order: "post"`, so Vite does not try to bundle it) prepends `<script src="./theme-boot.js"></script>` to the `<head>` of `index.html` only, not `devtools.html`. It is a classic script, without `type="module"`.
- The CSS fallback of ARCH-DECISION-034 still renders `Système` correctly if the script fails. The `ThemeController` re-applies the same attribute when the app starts.

## Consequences

- One extra request of under 2 kB from the extension package. It blocks parsing for well under a millisecond.
- The CSP and the manifest are unchanged.
- The boot logic is unit-tested, and the built output is tested by running it in a `node:vm` context with fakes. Real first-paint behaviour still has to be checked by hand in Chrome and Firefox.
- In dev mode, the stylesheet is injected by JavaScript, so a flash can still happen there. That is Vite's behaviour, not the extension's.
