# Changelog

## [Unreleased]: US-001 to US-003, image optimisation

### Added

- **"Ne pas redimensionner les images dans le navigateur" measures a real gain.**
  - Oversized images are compared with their display size multiplied by the screen density, which the detail shows ("Densité d'écran : 2x").
  - Each one is re-encoded at its target size, in its own format.
  - The rule is graded by the share of the image weight that can be saved: A below 10 %, B up to 30 %, C above. Gains under 10 kB are ignored.
- New best practice **"Utiliser des formats d'image optimisés"** (`UseOptimizedImageFormats`): JPEG images are estimated as AVIF (quality 65) and PNG images as lossless WebP, with the same grading.
- **Estimated image gain** per page and for the whole journey, without double counting between the two rules. An image flagged by both is estimated resized *and* converted.
  - Images served from the cache count as 0 on that page.
  - Pending and partial results are labelled ("≥ … (estimation en cours)", "(N images non évaluées)", "(partiel)").
- **Progress display:** while images are being estimated, the rule shows "Estimation en cours… (n/N images)" instead of a grade, and updates by itself, including on pages already closed.
- **CSV export:** new column "Gain images estimé (ko)". It is suffixed " (partiel)" while estimating, and empty for analyses saved before this version.
- **WASM image codecs:** the single-thread `@jsquash/*` builds of mozjpeg, PNG, oxipng, WebP, AVIF and resize.
  - They run in a dedicated Web Worker and are loaded only when needed, adding about 5.9 MB per browser package.
  - The extension may re-download images of the analysed site, from the HTTP cache when possible, when DevTools did not keep their content. Nothing is sent to any third party.

### Changed

- **Chrome 103 or later is required**, because the manifest CSP now allows `'wasm-unsafe-eval'` to compile the codecs. Firefox stays at 109 or later.
- Stopping an analysis while estimations are running saves it at once. The pending images are shown as "non évaluée (analyse arrêtée)".
- GIF, BMP, ICO, TIFF, SVG and animated images are not evaluated by the image rules.

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
