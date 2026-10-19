# ARCH-DECISION-004: Best practices are stateless rules (`collect` + pure `evaluate`)

- **Status:** Accepted (REFACTOR-001), **amended by [ARCH-DECISION-007](ARCH-DECISION-007-async-image-estimation.md)** (US-001): a rule may also declare pure `estimations()` jobs, and `evaluate` reads their results through `RuleContext.estimates`. `evaluate` stays pure and synchronous.
- **Supersedes:** `BestPraticesManager`, `BestPracticesAnalyzer`, the `*Analyzer` classes, `src/scripts/shared/rules/*`

## Context

The previous best-practice code had several problems:

- Analyzers called `chrome.scripting` with a `tabId`, which is infrastructure inside the domain. They therefore only ran in the Chrome adapter.
- They were stateful instances in a module singleton, so results leaked between pages and analyses, and `clear()` was incomplete.
- Two kinds of analyzer were told apart by duck typing (`"analyzerHar" in entry`).
- Adding a rule touched 3 to 6 files.

Most sustainable-design rules need **both** page data and network data. For example, the "standard fonts" rule needs `document.fonts` and the font requests.

## Decision

- A rule is a `BestPracticeRule<TPage>` (`src/app/domain/best-practices/rule.ts`) with:
  - metadata: `id`, `name`, `category`;
  - an optional `collect(): TPage`, which runs in the page, must be self-contained and returns JSON;
  - a pure `evaluate({ url, requests, page }): RuleResult`.
- **One file per rule** in `best-practices/rules/`, registered in `RULES` (`best-practices/index.ts`).
- `evaluateRules(rules, { url, requests, pageData })` (`engine.ts`) is pure. It isolates failures: a throwing rule yields a `BestPractice` with `error` and no `compliance`.
- The Page agent imports `RULES` and runs `collect` **once per rule**, in parallel (`Promise.allSettled`) and through `executeScript({ func: rule.collect })`. It returns `Record<ruleId, CollectOutcome>`.
  - *Why one call per rule, not one batched call:* `executeScript` serialises `func` with `toString()` and MV3 forbids `eval` in extension contexts, so a single wrapper cannot call several collectors.
- Rules hold no state. Per-page data lives in `analyse-web-flow` and is reset when a page closes.

## Consequences

- Adding a rule means one file plus one registry line, and it works on Chrome, Firefox and `MockBrowser`.
- `evaluate` is unit-tested with plain fixtures. `collect` is tested in jsdom, including a "serialisable" test that rebuilds the function from its source, which catches accidental closures and imports.
- The `RULES` module is bundled into both the panel and the background script, so rule files must not import `ui/`, `infra/` or `chrome`. ESLint enforces this.
- Persisted `BestPractice` gains `category` (required), `offenders` and `error`, and `compliance` becomes optional. The store migrates legacy entries on restore.
