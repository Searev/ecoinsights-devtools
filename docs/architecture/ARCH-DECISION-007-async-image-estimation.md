# ARCH-DECISION-007: Asynchronous image estimation behind a domain queue; rule evaluation stays pure and synchronous

- **Status:** Accepted (US-001 to US-003)
- **Amends:** [ARCH-DECISION-004](ARCH-DECISION-004-stateless-best-practice-rules.md) (adds an optional `estimations` phase and `RuleContext.estimates`)

## Context

US-001 and US-002 need, for each image, the size it would have after a transformation (resize, format conversion). The only acceptable source is a real encode with WebAssembly codecs (US-002 "Fidelity"), which:

- is asynchronous and CPU-heavy (≈ 0.7 s for an AVIF encode of a 2 MP photo, see ARCH-DECISION-008);
- must run off the UI thread, one image at a time, cached per URL and transformation for the whole analysis;
- may finish after the page that needed it has been closed by a navigation.

ARCH-DECISION-004 says a rule is `collect` (in the page) + **pure, synchronous** `evaluate`. An async `evaluate` would break the engine's guarantees (failure isolation, determinism, cheap re-evaluation on every network request), and would make rules own scheduling and caching, which ARCH-DECISION-003 gives to the domain use case.

Options considered:

1. **Async `evaluate`.** Rejected: every rule pays for a few; re-evaluation on each request would re-trigger work; failure isolation and tests get harder.
2. **Estimation inside the rule module (module-level cache).** Rejected: rules must stay stateless (004), and the background bundle imports the rules.
3. **A third, declarative phase + a domain queue (chosen).**

## Decision

- **A rule may declare estimation jobs**, pure and synchronous:
  `estimations?(ctx: PlanningContext<TPage>): EstimationJob[]`, where a job is `{ url, declaredType, transform }` (`resize` | `convert` | `resize-convert`), all plain data (`src/app/domain/models/image-estimation.ts`).
- **`evaluate` stays pure and synchronous.** It receives `ctx.estimates: EstimateLookup`, a read-only view of the cache returning `pending | estimated | skipped(reason) | failed(reason)` (or `undefined` if never requested, treated as pending). Same input, same output: a pending estimate is just a state of the input.
- **A rule result can be in progress.** `RuleResult.compliance` becomes optional; `progress: { done, total }` is set while any of the rule's images is pending, and the UI shows "Estimation en cours… (done/total images)" instead of a grade. `RuleResult.images: ImageFinding[]` carries the per-image findings (persisted in `BestPractice.images`), which US-003 aggregates.
- **The domain owns scheduling**: `EstimationQueue` (`src/app/domain/image-estimation/estimation-queue.ts`), created per analysis by `analyse-web-flow`:
  - cache keyed by `estimationKey(job)` = URL + transformation (US-002 §3): a job is encoded at most once per analysis (US-001 scenario 11);
  - FIFO, concurrency 1 (US-001 §5);
  - `onChange` after each settled job; never calls listeners synchronously from `request()`;
  - `stop()` turns every pending job into `skipped(analysis-stopped)` and ignores late results (scenario 12).
- **The port is `ImageEstimator`** (`src/app/domain/models/image-estimator.ts`): `estimate(job): Promise<EstimationOutcome>`, never rejects; optional `cancel()`. It is injected into `analyseWebFlow` through `options.imageEstimator`, the same way `Browser` is (003). It is **not** part of `Browser`: encoding is not browser access, and keeping it separate leaves `MockBrowser`/`ExtensionBrowser` untouched.
- **The use case re-evaluates every page of the analysis, closed ones included**, when the queue changes, so results update live without user action (scenario 8). Closed pages keep their evaluation input (requests, collected page data).
- **`stopAnalysis()` returns the final pages** (`PageAnalysis[]`), with pending jobs settled as `analysis-stopped`, so the UI saves exactly that (scenario 12).
- **US-003 combined estimate** is not a rule: `image-gain.ts` (domain, pure) plans `resize-convert` jobs for images flagged by both image rules, and computes `PageAnalysis.imageGain` from the findings and the same lookup.

## Consequences

- Rules without estimations are unchanged, apart from the optional `estimates` in their context (tests build contexts with it).
- The engine gains `planEstimations(rules, input)` and an `estimates` input (default: every job `failed(estimator-unavailable)`, so legacy callers and tests without an estimator get "Non évaluée" instead of an eternal "en cours").
- A rule cannot run an estimation that depends on another rule's estimation; cross-rule logic (US-003) lives in a dedicated domain module.
- Persisted `BestPractice` gains `progress?` and `images?`; `PageAnalysis` gains `imageGain?`. Older analyses simply lack them (no migration needed beyond defaults, see `store-codec.ts`).
