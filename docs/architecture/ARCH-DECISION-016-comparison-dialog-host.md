# ARCH-DECISION-016: One app-level comparison dialog driven by a pure controller; object URLs owned by the UI; `blob:` images allowed by the CSP

- **Status:** Accepted (US-005)

## Context

- During a recording, every network request rebuilds the analyses, and `BestPractices` re-creates its list items (`<For>` over new objects). A dialog rendered inside a line would be destroyed while the user looks at it.
- The project has no Solid component tests: every behaviour (states, retry, double click, late results after close, object URL lifecycle) must be testable in plain `.ts`.
- Versions are displayed from bytes. `<img src="blob:…">` must be allowed in the extension page in Chrome ≥ 103 and Firefox ≥ 109, and the URLs must be revoked on close.

## Decision

- **One dialog for the app.** `ImageComparisonProvider` (`ui/analysis/comparison/comparison-context.tsx`) is mounted once in `src/app/index.tsx`, around `<App/>`, with the session `ImageVariantStore` (ARCH-DECISION-014). It renders a single native `<dialog>` (`showModal()`, `aria-labelledby`). Lines call `useImageComparison().open(subject, triggerElement)`.
  - Focus returns to the trigger element; if a re-render detached it, to the element with the same `data-comparison-key` (`ruleId|url`), if any.
- **Pure controller** (`ui/analysis/comparison/comparison-controller.ts`): `createComparisonController({ store, objectUrls })` exposes `open`, `select`, `retry`, `setNativeSize`, `displayFailed`, `close`, `state()` and `subscribe`. State per version: `idle | loading | loaded | error` (+ selected version, display mode, "image changed" flag).
  - `open` while open is ignored (scenario 15); results after `close` (or for a previous opening) are ignored and create no object URL; a cached version goes straight to `loaded` through `peek*` (scenario 8).
  - `objectUrls: { create(bytes, mimeType): string; revoke(url): void }` is injected (tests count create/revoke; the component passes `URL.createObjectURL(new Blob(...))`). Every URL created during an opening is revoked on `close` (NFR sobriety).
- **Formatting and layout** are pure helpers next to it (`comparison-format.ts`: resolution, size, format, gain, alt, messages; `comparison-layout.ts`: page box scaled to the dialog width, native CSS size = natural ÷ `devicePixelRatio`, initial mode).
- **CSP:** the extension pages CSP stays `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. It has **no `img-src` and no `default-src`**, so images from `blob:` URLs are allowed in both browsers. `scripts/manifest.test.mjs` asserts that neither directive appears, so a future CSP change cannot silently break the dialog. Adding an explicit `img-src` was rejected: it would only restrict what is allowed today.

## Consequences

- The dialog survives live updates of a recording; its subject is a snapshot taken at click time.
- The Solid component stays thin wiring (refs, events, scroll position kept across toggles in "Taille réelle"); manual checks cover it.
