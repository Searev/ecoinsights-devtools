# ARCH-DECISION-006: Test strategy

- **Status:** Accepted (REFACTOR-001)

## Decision

- **Runner:** Vitest 0.34 (the last line compatible with Vite 4), configured in `vitest.config.ts`. Tests live next to their code as `*.test.ts`.
  - `npm test` runs the whole suite.
  - `npx vitest run <path>` runs a subset.
- **Environment:** `node` by default. Page-side code (rule collectors, the Probe's navigation listener) opts in to `jsdom` with a `// @vitest-environment jsdom` header.
- **Test through interfaces with injected fakes, never `vi.mock` of our own modules:**
  - The Page agent receives a `chrome`-like object (a typed subset defined next to it). Tests pass a hand-written fake that records calls and lets the test fire `onUpdated`, `onMessage` and `onDisconnect`.
  - `ExtensionBrowser` receives its `runtime` and `devtools` dependencies the same way. Tests use a fake port pair.
  - `analyse-web-flow` is tested against `MockBrowser` with `vi.useFakeTimers()`.
  - Rules: table-driven tests on `evaluate`, jsdom tests on `collect`, plus one generic test over `RULES` that rebuilds every `collect` from its source (`new Function("return (" + src + ")")()`) to prove it is self-contained.
- **TDD:** write the failing test first and record the red run, then implement.
- **Quality gates for every change:** `npm test`, `npm run typecheck` and `npm run lint` must pass.

## Not covered (manual)

Loading the built extension in Chrome and Firefox is still a manual smoke test. The checklist is in the REFACTOR-001 plan, §5. `web-ext lint` is available for the Firefox build.
