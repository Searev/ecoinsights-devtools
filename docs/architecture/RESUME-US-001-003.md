# Resume point: US-001 → US-003 (image optimisation epic)

> **Status: COMPLETED (2026-10-19, third team-lead run).** All scopes are done: A, B1, B2, C, E, and D (wave 2). The typecheck gate was fixed (`tsconfig.json` `files`, see ARCH-DECISION-008).
>
> - **Gates:** typecheck 0 errors; 35 files / 416 tests green; lint 0 errors (1 known warning); both builds OK.
> - **Review:** [REVIEW-US-001-003.md](../reviews/REVIEW-US-001-003.md), **APPROVED**.
> - **Docs updated:** ARCHITECTURE, README, CHANGELOG, CLAUDE.md.
> - **Remaining** (owner only): the manual checks in real Chrome and Firefox (review §6), and git. Nothing is committed.
>
> The rest of this file is the historical resume state, kept for reference.

- **Paused:** 2026-10-19, at the owner's request. Every agent is stopped and nothing is running.
- **Branch:** `feat/image-optimisation`. All work is uncommitted.
- **Plan:** [TECH-US-001-003-plan.md](TECH-US-001-003-plan.md)
- **Decisions:** ARCH-DECISION-007 to 011 (004 amended)

> **Resumed 2026-10-19 (second team-lead run), then handed back early.** Done: owner decisions §1 applied (plan §3 incl. an "Owner review" paragraph, ARCH-DECISION-008 resize-AVIF row, `policy.ts` `OWN_FORMAT_ENCODING.avif` = q65 speed 6). A and E reviewed: **accepted, no rework** (76 tests green on `src/app/domain/image-estimation` + `src/app/ui`, no tsc or lint error in their paths). B1, B2 and C were re-dispatched in parallel as background team-members, but the lead run ended before their reports came back: **check the working tree for their output** (B1: `jsquash-codecs.ts`, `image-inspect.ts`, `pipeline.ts`, `codec.worker.ts`; B2: `getResourceContent`, `getImageEstimator`, manifest CSP, `vite.config.ts`; C: `engine.ts`, rule rewrites, `optimised-formats.rule.ts`), verify, re-dispatch whatever is missing, then D, gates, review and docs (§4 steps 4–7).

## 1. Owner decisions taken after the plan was written

Apply these when resuming. They override the plan where they differ.

| Topic | Decision |
|---|---|
| D1: AVIF speed 6 instead of sharp's default effort | **Accepted** |
| D2: PNG re-encoded with oxipng level 2 | **Accepted** |
| D3: same-format re-encode settings | **Accepted, except AVIF: use quality 65**, not 50. WebP stays q80, or lossless if the source is lossless. Update plan §3 D3 and ARCH-DECISION-008 or 011 accordingly. |
| D4: GIF, BMP, ICO and TIFF excluded from the resize rule | **Accepted** |
| D5: cached/304 images fall back to body size | **Accepted** |
| D6: re-fetch of images not captured by DevTools | **Accepted: keep the re-fetch.** Reword the README "Vie privée" section: the extension may re-download, from the HTTP cache when possible, images of the analysed site; nothing is sent to any third party. |
| Bundle: about 5.9 MB of lazily loaded WASM per target | **Accepted** |

## 2. State per scope

| Scope (plan §2) | State | Files present |
|---|---|---|
| Lead contracts | Done; contract tests pass | `domain/models/image-estimation.ts`, `image-estimator.ts`, `domain/image-estimation/{policy,image-requests,signature}.ts`, `infra/image-codec/worker-protocol.ts`, `infra/estimator-context.tsx`, plus amendments to `rule.ts`, `best-practice.ts`, `page-analysis.ts` and `analyse-web-flow.ts` (signatures) |
| **A**: estimation queue + combined gain | **Reported done** (26 tests; red runs recorded). Not yet reviewed by the lead. | `domain/image-estimation/{estimation-queue,image-gain}.ts` + tests |
| **E**: UI progress + gains | **Reported done** (17 new tests; red runs recorded). Not yet reviewed. | `ui/analysis/image-gain-view.ts` + test; changes to `best-practices-view.ts`, `BestPractices.tsx`, `AnalysedPage.tsx`, `AnalysisResult.tsx`, `SavedAnalysis.tsx`, `PendingAnalysis.tsx` |
| **B1**: codec pipeline + worker | **Interrupted** (API network error). Tests are written and red; implementation is partial. | `infra/image-codec/{base64.ts,codecs.ts}`, `base64.test.ts`, `image-inspect.test.ts` (no `image-inspect.ts` yet), `jsquash-codecs.test.ts`, `testing/{fake-codecs,node-wasm,synthetic}.ts`. No worker entry and no pipeline yet. |
| **B2**: estimator adapter + build | **Interrupted** (API network error) | `infra/image-estimator/{fake-image-estimator,image-bytes-source,worker-image-estimator}.ts` + tests. **Not started:** `ExtensionBrowser.getResourceContent`, `getImageEstimator()`, `index.tsx`, manifest CSP `'wasm-unsafe-eval'`, Chrome min version 103, `vite.config.ts` worker config. |
| **C**: image rules + engine | **Interrupted** (API network error) | `best-practices/rules/image-rule-helpers.ts` + test, `best-practices/testing/image-fixtures.ts`. **Not started:** `dont-resize-images.rule.ts` rewrite, new `UseOptimizedImageFormats` rule, `engine.ts` `estimates` default, the existing rule tests' `RuleContext.estimates`. |
| **D** (wave 2): use-case integration, CSV column, store codec | Not dispatched | none |
| Lead review, `REVIEW-US-001-003.md`, docs | Not started | none |

## 3. Workspace health at pause

- **`npm test`:** 28 files pass and 2 fail (279 tests passed). The 2 failing files are B1's tests whose implementation is missing: `image-inspect.test.ts` and `jsquash-codecs.test.ts`. They fail as expected for a red TDD step.
- **`tsc`:** 10 errors, all inside the interrupted scopes:
  - C: `engine.ts` and 3 existing rule tests (`RuleContext.estimates`).
  - B1: `image-inspect.test.ts`, `jsquash-codecs.test.ts` and `testing/node-wasm.ts`.
- **Baseline before the epic:** 17 files and 157 tests, typecheck 0, lint 0 errors, build OK, `dist/chrome` 408 KB.

## 4. How to resume

Start the **team-lead** agent with:

> Resume the image-optimisation epic from `docs/architecture/RESUME-US-001-003.md`.
> 1. Apply the owner decisions in §1 to the plan and decision records.
> 2. Review the reports of A and E against the files: red-run evidence, ownership, and `npx vitest run` on their paths.
> 3. Re-dispatch B1, B2 and C as `team-member` agents. Tell each one that partial work exists in its scope and that it must read it, keep what is sound, and finish with TDD (red first).
> 4. Then dispatch D (wave 2).
> 5. Run all gates (typecheck, test, lint, both builds, CSP in `dist/*/manifest.json`, bundle size against the 408 KB baseline).
> 6. Write `docs/reviews/REVIEW-US-001-003.md`.
> 7. Update ARCHITECTURE.md, README (including "Vie privée" per D6), CHANGELOG and CLAUDE.md.
>
> Do not commit, push or merge. Use `bastienhub@gmail.com` as the placeholder.
