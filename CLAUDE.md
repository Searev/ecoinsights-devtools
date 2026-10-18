# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EcoInsights Profiler is a Manifest V3 DevTools extension for Chrome and Firefox (≥ 109). It measures the environmental impact (EcoIndex) of a full user journey, including SPAs, and checks sustainable-design best practices. README and UI strings are in French; code, comments and tests are in English.

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
- **Adding a best practice:** one file in `src/app/domain/best-practices/rules/` exporting a `BestPracticeRule` (optional `collect()` + pure `evaluate()`), one line in `RULES` (`index.ts`), and a `*.rule.test.ts`.
  - `collect()` is serialised with `toString()` and run in the page: no imports, no module-level helpers, no closures, JSON-serialisable result. `rules-registry.test.ts` checks this automatically.
  - Rule files are also bundled into the background script.
- **Build.** The manifest is generated from `src/manifest/base.json` + `chrome.json` / `firefox.json`; only `background` and Firefox's `gecko` settings differ. The background and Probe are bundled with esbuild, and the panel with Vite.

## Tests

- Tests live next to the code as `*.test.ts`, in a node environment. Add `// @vitest-environment jsdom` for page-side code; jsdom has no layout, so stub `clientWidth` and similar.
- Inject fakes (fake `ChromeLike` in `src/background/testing/fake-chrome.ts`, fake ports, `MockBrowser` with `vi.useFakeTimers()`). Do not `vi.mock` project modules.
- There are no Solid component tests. Extract logic into pure `.ts` helpers to test it.

## Conventions

- The EcoIndex formula and impact factors have restrictive licences (see README). Don't copy them elsewhere.
