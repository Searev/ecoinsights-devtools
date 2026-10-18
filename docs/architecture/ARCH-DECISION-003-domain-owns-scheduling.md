# ARCH-DECISION-003: The domain owns timers and receives `Browser` by injection

- **Status:** Accepted (REFACTOR-001)

## Context

- The 1 s DOM-polling loop existed in three copies: the Chrome adapter, the Firefox background script and the mock.
- `analyse-web-flow` called `getBrowser()` from `infra`, so the domain depended on infrastructure and could not be tested without module mocking.
- The `Browser` interface imported a concrete domain class (`BestPracticesAnalyzer`) and exposed three separate navigation listeners for one concept.

## Decision

- **No timers behind the `Browser` interface.** `analyse-web-flow` polls `getPageInfo()` and schedules best-practice collection itself, using chained `setTimeout`s so calls never overlap.
- **`Browser` is injected:** `analyseWebFlow(browser, params, consume, options?)`. The UI gets it from `useBrowser()` (a Solid context), and only `src/app/index.tsx` calls the factory.
- **Navigation is one stream:** `onNavigation(listener)` emits the discriminated union `NavigationEvent` (`url-changed` | `link-clicked` | `form-submitted`).
- **The interface imports domain models only.**

## Consequences

- One polling implementation, testable with fake timers against `MockBrowser`.
- Adapters become thin and stateless apart from their transport.
- The interval values (1 s DOM, ≥ 5 s collection) are domain policy, and tests can override them through `options`.
