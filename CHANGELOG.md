# Changelog

## [Unreleased]: REFACTOR-001

### Changed

- **Single code path for Chrome and Firefox.**
  - The DevTools panel now talks to one background **Page agent** through a typed protocol (`src/shared/protocol.ts`), with request ids, timeouts and explicit errors.
  - `BrowserChrome`, `BrowserFirefox` and the old bridge are removed.
- **Probe injected on demand.** The navigation Probe is only injected in the inspected tab while an analysis is recording. Firefox no longer injects a content script into every page.
- **Best practices are now stateless rules.** Each rule is one file: an optional page `collect()` and a pure `evaluate()`. They run on both browsers.
- **The analysis use case owns DOM polling and best-practice scheduling.** It receives the `Browser` by injection.
- **Per-browser build.**
  - `npm run build` produces `dist/chrome`, `dist/firefox` and their zips, from `src/manifest/base.json` plus per-browser overlays.
  - The `contextMenus` and `activeTab` permissions are removed.
  - Firefox gets a `gecko.id`.
- **Best-practice results** are grouped by category, list the offending resources, and show "Non évaluée" when a rule could not run.

### Added

- New best practice: **"Utiliser des polices standards"** (`UseStandardFonts`), which counts the downloaded font files and their weight.
- An error screen with "Réessayer" when an analysis cannot start: missing permission, or the background script not responding.
- A banner when an analysis cannot be saved because browser storage is full.
- A test suite (Vitest + jsdom), plus `npm test`, `npm run typecheck` and `npm run lint`.
- Architecture documentation and decision records in `docs/architecture/`.

### Fixed

- Best practices were never evaluated on Firefox.
- "Refresh on start" measured the previous page on Firefox (the reload resolved too early).
- Chrome reported the site permission as always granted.
- Startup failed on Chrome with undocked DevTools.
- The Probe's single-instance guard never worked, so click listeners piled up on every navigation.
- Background subscriptions leaked when one of several DevTools panels was closed.
- Best-practice results were one tick late, and leaked between pages and analyses.
- The "new page on form submit" option had no effect.
- Images resized along one axis only, or with "svg" in their URL path, were not reported.
- Purging the cache before an analysis also erased the browser's download history.
- New analyses were not persisted until they were stopped.
