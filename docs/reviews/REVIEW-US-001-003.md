# REVIEW-US-001-003: Image optimisation (resize gain, optimised formats, combined gain)

- **Plan:** [TECH-US-001-003-plan.md](../architecture/TECH-US-001-003-plan.md)
- **Stories:** [US-001](../stories/US-001.md), [US-002](../stories/US-002.md), [US-003](../stories/US-003.md)
- **Decisions:** ARCH-DECISION-007 to 011 (004 amended)
- **Branch:** `feat/image-optimisation` (uncommitted working tree)
- **Reviewer:** team lead
- **Date:** 2026-10-19

## 1. Delivery summary

| Scope | Content | Tests | Result |
|---|---|---|---|
| Lead contracts | models, policy, `image-requests`, `signature`, worker protocol, estimator context | 32 (3 files) | n/a |
| A | estimation queue, combined page gain | 26 (2 files) | Accepted, no rework |
| B1 | WASM codecs, inspection, pipeline, worker entry | 44 (5 files) | Accepted after re-dispatch (interrupted run) |
| B2 | bytes source, worker estimator, fake estimator, `getResourceContent`, factory, manifest CSP, Vite worker | 55 (6 files) | Accepted after re-dispatch (interrupted run) |
| C | resize rule rewrite, `UseOptimizedImageFormats`, engine `planEstimations` | 144 (7 files, including the 2 pre-existing rule tests that were updated) | Accepted after re-dispatch (interrupted run) |
| E | UI progress and gains | 23 (3 files) | Accepted, no rework |
| D (wave 2) | use-case integration, CSV column, store codec | 49 (5 files, including the 26 pre-existing use-case tests) | Accepted, no rework |
| Lead | typecheck gate (`tsconfig.json`) | n/a | Fixed, recorded in ARCH-DECISION-008 |

**Total:** 35 test files, 416 tests (baseline before the epic: 17 files, 157 tests). Per-scope counts include the pre-existing tests in each scope's paths.

## 2. Quality gates

### Gate 1: TDD execution: PASS (with noted gaps)

- **Lead contracts:** contract tests were written and run before the sub-agents started (`image-estimation.test.ts`, `image-requests.test.ts`, `signature.test.ts`).
- **A:** red runs recorded for both files ("module not found", then assertion failures).
  - The earlier note "no explicit test that an `analysis-stopped` finding counts as not evaluated" turned out to be covered. `image-gain.test.ts` has a case where `failed`, `too-large` and `analysis-stopped` findings give `notEvaluatedCount: 3`, plus a combined `analysis-stopped` fallback case.
  - D's use-case test also checks the `analysis-stopped` lines end to end.
- **B1:** red runs recorded ("missing module" on `image-inspect.ts`, `jsquash-codecs.ts`, `pipeline.ts`).
  - The tests run the **real** WASM codecs under Node.
  - The AVIF q65 speed 6 timing on a 2.07 MP synthetic image is ≈ 1.7 s in Node (lead spike: 0.69 s on a real photo; synthetic noise is harder to compress).
  - `codec.worker.ts` is wiring only and is not unit-tested, by design.
- **B2:** red runs recorded.
  - **Gap:** the extension branch of `getImageEstimator()` (`WorkerImageEstimator` with `new CodecWorker()` from `?worker`) has no unit test, because the `?worker` import only resolves under Vite. It is covered by the build check (Gate 5) and by manual check 1.
- **C:** red runs recorded for the new and rewritten files.
  - `image-rule-helpers.test.ts` was already green when C was re-dispatched: it was written and implemented in the interrupted run. Its red run was lost with that run.
- **E:** red runs recorded (17 new tests).
- **D:**
  - `export-csv.test.ts` (5) and the new `store.test.ts` cases (3) were red before their code.
  - **Gap:** for `analyse-web-flow.images.test.ts` (9 tests), D wrote the implementation first. It then produced the red run by temporarily disabling the queue integration: 8 failed and 1 passed, the "best practices off" case being expected to pass.
  - This proves the tests detect a missing integration, but it is not test-first. Accepted, because the tests assert the stories' observable behaviour, not the implementation. Flagged for the next iteration.

### Gate 2: Context isolation & security: PASS

- `vi.mock(` has 0 occurrences in `src` and `scripts`; every boundary uses injected fakes. The tests use `DeferredImageEstimator`, a fake `WorkerLike`, fake codecs and `MockBrowser`.
- The domain does not import `infra/` or `ui/`, and uses no `chrome`/`browser` global. ESLint enforces this, and `grep` confirms it.
- Only `src/app/index.tsx` calls `getBrowser()` and `getImageEstimator()`. The UI gets the estimator through `useImageEstimator()`.
- **Codec isolation:**
  - All decoding and encoding runs in a dedicated Web Worker.
  - The worker chunk is a classic IIFE with no `import.meta`, no `eval` and no `new Function`.
  - It uses single-thread codec builds only, so no `SharedArrayBuffer` and no nested workers.
  - WASM is fetched from the extension's own assets: no remote code.
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` on both targets. Chrome `minimum_chrome_version` is 103.
- **Measurement bias (ARCH-DECISION-010):**
  - Image bytes come from DevTools `getContent()` first.
  - Otherwise the panel re-fetches the image with `cache: "force-cache"`. The panel's request is not part of the inspected tab, so it is not in the page's requests or EcoIndex. To be verified manually (check 2).
- **Privacy (D6, owner-accepted):** the panel may re-download images of the analysed site. Nothing is sent to any third party. The README "Vie privée" section is reworded accordingly.
- **Unchanged:** permissions, and the Firefox `gecko.id` `bastienhub@gmail.com` (`strict_min_version` 109.0).

### Gate 3: Reactive state standard: PASS

- **Estimation states:** `pending → estimated | skipped(reason) | failed(reason)`, explicit in `EstimateState`.
- **Rules while estimating:** `compliance` undefined plus `progress { done, total }`. With nothing evaluable, `compliance` is undefined with a "Non évaluée" detail.
- **Page gain:** `pending | partial | complete` is derived by `imageGainStatus()`.
- **Live updates:** `queue.onChange` triggers a new `consume`. Closed pages are rebuilt (best practices and `imageGain` only) when the queue version moved, so a network request on the current page does not re-evaluate closed pages (tested).
- **Stop:** `stopAnalysis()` stops the queue and returns the final pages, with pending images as `skipped(analysis-stopped)`. It is idempotent.
  - `consume` is never called after stop, including for late estimates (tested).
  - The worker estimator's `cancel()` terminates the worker.
- **Robustness:**
  - Worker timeout (120 s): `failed(timeout)`, and the worker is recreated for the next job.
  - `onerror`: `failed(encode-failed)`.
  - With no estimator, the image rules show "Non évaluée" and nothing hangs (tested).

### Gate 4: UI & accessibility: PASS

- **In-progress rules:** the header shows `<span role="status">Estimation en cours… (2/5 images)</span>` instead of the badge. They stay visible under the "non suivies" filter.
- **Page gain:** "Gain estimé (images)" on each page. The analysis gain is "Gain estimé sur le parcours", in the total bar or in the saved-analysis summary.
  - Gains are plain text, not colour only.
  - `role="status"` is set only while pending. This is accepted: a polite live region is only useful while the value changes.
- **French formatting:** "204 ko", "1,2 Mo", "≥ 120 ko (estimation en cours)", "80 ko (2 images non évaluées)", "(partiel)". Legacy analyses show "—".
- **CSV:** last column "Gain images estimé (ko)", one decimal with a dot ("204.0"), " (partiel)" while pending, empty for legacy pages.
- There are no component tests; all display logic is in tested pure helpers (`image-gain-view.ts`, `best-practices-view.ts`).

### Gate 5: Full suite integration: PASS

Re-run by the team lead on the final tree:

```
npm run typecheck → tsc --noEmit, 0 errors (exit 0)
npm test          → Test Files 35 passed (35) | Tests 416 passed (416)
npm run lint      → ✖ 1 problem (0 errors, 1 warning)   [known: browser-context.tsx solid/reactivity]
npm run build     → Built dist/chrome, Created dist/chrome.zip, Built dist/firefox, Created dist/firefox.zip
```

| Check | Chrome | Firefox |
|---|---|---|
| CSP `extension_pages` | `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` | same |
| Minimum version | `minimum_chrome_version` 103 | `gecko.strict_min_version` 109.0, `gecko.id` `bastienhub@gmail.com` |
| Worker chunk `codec.worker-e3e1ee39.js` (130 kB) | IIFE `(function(){"use strict";…})()`, 0 `import.meta`, 0 `eval`, 0 `new Function` | same |
| Worker loader `codec.worker-0ff110ab.js` (114 B) | ES module of the panel: `new Worker(new URL(…, import.meta.url))` (expected) | same |
| `.wasm` assets | 9, separate files, 5.76 MB in total | 9, same |
| `dist/<target>` size | 6 324 kB (baseline 408 kB) | 6 324 kB |
| Zip size | 2 104 kB (baseline 128 kB) | 2 104 kB |

The size increase is the lazily loaded WASM (owner-accepted, about 5.9 MB). The panel's JS chunks barely change.

## 3. Rework rounds

| Id | Finding | Resolution |
|---|---|---|
| R1 | B1, B2 and C were interrupted by an API network error in their first runs, leaving partial work and red tests (2 failing files, 10 `tsc` errors). | Re-dispatched with the instruction to keep sound partial work and finish with TDD. All three were green on the second run. |
| R2 | Typecheck gate: 12 `TS2503: Cannot find namespace 'EmscriptenWasm'` errors inside `node_modules/@jsquash/{avif,jpeg,webp}/codec/**/*.d.ts`. They came from importing the single-thread glue directly (ARCH-DECISION-008). | Fixed by the lead: `tsconfig.json` lists the packages' own `emscripten-types.d.ts` in `files`, and makes `include` explicit, with an unchanged set of 130 compiled project files. `skipLibCheck` was rejected. Reasons are in ARCH-DECISION-008, Consequences. |
| R3 | Lead precision given to D before dispatch: avoid re-evaluating closed pages on every request of the current page. | Built in by D with a queue-version counter, and tested. |

## 4. Accepted deviations

- **D1 to D7:** see plan §3. D1 (AVIF speed 6), D2 (oxipng level 2), D4 (all GIF/BMP/ICO/TIFF excluded) and D5 (body size for cached/304 images) are accepted by the owner as written.
- **D3:** accepted with **AVIF q65** for the own-format AVIF re-encode (`policy.ts`, ARCH-DECISION-008).
- **D6:** accepted. The panel-side re-fetch is kept, and the README "Vie privée" section is reworded.
- **Bundle:** about 5.9 MB of WASM per target, owner-accepted.
- **D7:** no percentage is shown while a page gain is pending. The owner did not comment, so it stays a lead decision.
- **tsconfig (R2):** `files` plus an explicit `include`, rather than `skipLibCheck`.

## 5. Known limitations

- **Combined job pending at stop:** if an image's combined `resize-convert` job is still pending when the analysis is stopped, it becomes `skipped(analysis-stopped)`. The page gain then uses the fallback `max(resize, format)` and the page is marked "partiel" (`fallbackCount`). This is consistent with US-003 S10.
- **Rebuild granularity:** closed pages are rebuilt when any estimate settles, not only their own. The cost is one pure evaluation per closed page per settled job, negligible next to an encode.
- **Synthetic AVIF timing:** ≈ 1.7 s per 2 MP image in Node. A journey with many large JPEGs takes a while to settle, but the panel stays responsive (worker, concurrency 1).
- **Unit test gap:** the extension branch of `getImageEstimator()` is not unit-tested (Gate 1).
- **Cookies:** images that need cookies the extension cannot send end as `failed(bytes-unavailable)`, shown as "non évaluée".
- **Still open from REFACTOR-001:** the `browser-context.tsx` lint warning is kept.

## 6. Manual checks still needed (owner, real browsers)

Plan §5. Nothing in this epic has been loaded in a real browser yet.

1. **Estimation runs:** on Chrome ≥ 103 and Firefox ≥ 109, load `dist/<target>` and record a page with oversized JPEG/PNG images.
   - Expected: "Estimation en cours… (n/N images)", then grades, gains and the page/journey gain lines. The panel stays responsive.
2. **No extra request:** record without `refreshOnStart`, so that images are re-fetched.
   - Expected: the inspected tab's DevTools Network panel shows no extra request, and the page's request count and EcoIndex are unchanged.
3. **Firefox:** no CSP error in the panel console when the worker compiles the WASM, and a cross-origin re-fetch succeeds.
4. **Stop:** stop an analysis while estimations are running.
   - Expected: it is saved at once, with "non évaluée (analyse arrêtée)" lines.
5. **Zoom:** at 150 % on a 1x screen, the detail shows "Densité d'écran : 1.5x".
6. **CSV export:** the "Gain images estimé (ko)" column. An analysis saved before this branch must open with "—" and export empty cells.
7. **Dev server:** `npm run dev` fetches no `.wasm` (fake estimator).

## 7. Open items for the owner

1. The manual checks in §6.
2. **Git:** nothing is committed. New files are untracked (`docs/stories/`, ADR 007–011, `src/app/domain/image-estimation/`, `src/app/infra/image-codec/`, `src/app/infra/image-estimator/`, …).
3. **D7** (no percentage while pending): confirm or override.

## Status

**Status: APPROVED.** All automated quality gates pass on both targets. Merge waits on the owner's go-ahead and the manual checks in §6.
