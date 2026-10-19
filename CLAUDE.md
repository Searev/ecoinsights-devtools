# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EcoInsights Profiler is a Manifest V3 DevTools extension for Chrome (≥ 103) and Firefox (≥ 109). It measures the environmental impact (EcoIndex) of a full user journey, including SPAs, and checks sustainable-design best practices, including image gains estimated by real WASM re-encoding. README and UI strings are in French; code, comments and tests are in English.

## Commands

- `npm run dev`: Vite dev server on http://localhost:3000. Outside an extension the factory returns a demo `MockBrowser`, so the UI runs without a real browser.
- `npm run build`: both targets via `scripts/build.mjs`, producing `dist/chrome`, `dist/firefox` and their zips. `npm run build:chrome` and `npm run build:firefox` build a single target.
- `npm test`: Vitest. Run a subset with `npx vitest run src/app/domain/best-practices`, or a single file with `npx vitest run path/to/file.test.ts`.
- `npm run typecheck` (tsc), `npm run lint` (ESLint), `npm run lint:firefox` (`web-ext lint` on `dist/firefox`).

## Architecture

Read `docs/architecture/ARCHITECTURE.md` and the `ARCH-DECISION-*.md` files before structural changes. Don't re-litigate those decisions without reason.

- **Four contexts, one code path for both browsers.**
  - The panel app (`src/app`) talks only to the background **Page agent** (`src/background/page-agent.ts`), over the typed RPC in `src/shared/protocol.ts`.
  - The Page agent does all `scripting`/`tabs`/`permissions`/`browsingData` work and injects the **Probe** content script (`src/content/probe.ts`) on demand.
  - Firefox DevTools pages cannot use those APIs, which is why the relay exists. Don't call them from `src/app`.
- **The `Browser` interface** (`src/app/domain/models/browser.ts`) is the seam.
  - Adapters: `ExtensionBrowser` (both browsers) and `MockBrowser` (dev and tests), both in `src/app/infra`.
  - UI gets it through `useBrowser()`. Only `src/app/index.tsx` calls `getBrowser()`.
- **Domain rules** (lint-enforced): `src/app/domain` never uses `chrome`/`browser` and never imports `infra/` or `ui/`. Test files are exempt.
- **Timers live in the domain.** `analyse-web-flow.ts` owns DOM polling (1 s) and best-practice collection scheduling; adapters have no timers.
- **Adding a new capability across the port:**
  1. Add an entry to `AgentRequests` in `protocol.ts`.
  2. Add a handler in `page-agent.ts`; the handler map is typed, so a missing one is a compile error.
  3. Add a method in `ExtensionBrowser` and `MockBrowser`, plus `Browser` if the domain needs it.
- **Adding a best practice:** one file in `src/app/domain/best-practices/rules/` exporting a `BestPracticeRule` (optional `collect()`, optional `estimations()`, pure `evaluate()`), one line in `RULES` (`index.ts`), and a `*.rule.test.ts`.
  - `estimations(ctx)` is pure and synchronous. It returns the `EstimationJob`s the rule needs (image URL + `resize` / `convert` / `resize-convert`). The use case queues them (one `EstimationQueue` per analysis, cached by `estimationKey`) and re-evaluates every page when one settles.
  - `evaluate(ctx)` reads them through `ctx.estimates` (`pending` / `estimated` / `skipped` / `failed`). While any is pending, return `progress` and no `compliance`; an undefined `compliance` without `progress` shows "Non évaluée".
  - Image policy (thresholds, encodings, formats) lives in `src/app/domain/image-estimation/policy.ts`. The image gain model is ARCH-DECISION-011.
  - `collect()` is serialised with `toString()` and run in the page: no imports, no module-level helpers, no closures, JSON-serialisable result. `rules-registry.test.ts` checks this automatically.
  - Rule files are also bundled into the background script.
- **Image estimation (ARCH-DECISION-007 to 011).**
  - The `ImageEstimator` port (`domain/models/image-estimator.ts`) never rejects. `getImageEstimator()` (only called in `index.tsx`) gives a `WorkerImageEstimator` in the extension and a `FakeImageEstimator` in `npm run dev`. The UI reads it with `useImageEstimator()`.
  - Image bytes come from DevTools content (`ExtensionBrowser.getResourceContent`), else a panel-side `fetch(url, { cache: "force-cache" })`, never from the Page agent.
  - Codecs: `src/app/infra/image-codec/` runs the single-thread `@jsquash/*` glue, imported directly (never the packages' `index.js`, which pull multi-thread builds), in a classic IIFE Web Worker (`codec.worker.ts`, imported with `?worker`). Each `.wasm` is a separate asset loaded lazily.
  - Codec tests run the real WASM under Node (`testing/node-wasm.ts`) on synthetic images, with no binary fixtures.
  - The manifest CSP needs `'wasm-unsafe-eval'`, hence `minimum_chrome_version` 103.
  - **Type-checking:** `tsconfig.json` lists `node_modules/@jsquash/jpeg/emscripten-types.d.ts` in `files`, because the glue `.d.ts` files need its global `EmscriptenWasm` namespace. Do not switch to `skipLibCheck` (ARCH-DECISION-008). New project source folders must be under `src/` or added to `include`.
- **Build.** The manifest is generated from `src/manifest/base.json` + `chrome.json` / `firefox.json`; only `background`, Chrome's `minimum_chrome_version` and Firefox's `gecko` settings differ (the CSP is in `base.json`). The background and Probe are bundled with esbuild, and the panel with Vite.

## Tests

- Tests live next to the code as `*.test.ts`, in a node environment. Add `// @vitest-environment jsdom` for page-side code; jsdom has no layout, so stub `clientWidth` and similar.
- Inject fakes (fake `ChromeLike` in `src/background/testing/fake-chrome.ts`, fake ports, `MockBrowser` with `vi.useFakeTimers()`, `DeferredImageEstimator` in `src/app/domain/use-case/testing/`, fake codecs in `src/app/infra/image-codec/testing/`, a fake `WorkerLike` in `worker-image-estimator.test.ts`). Do not `vi.mock` project modules.
- There are no Solid component tests. Extract logic into pure `.ts` helpers to test it.

## Conventions

- The EcoIndex formula and impact factors have restrictive licences (see README). Don't copy them elsewhere.
