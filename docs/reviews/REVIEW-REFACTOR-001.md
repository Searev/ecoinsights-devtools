# REVIEW-REFACTOR-001: Unified browser seam and best-practice rule engine

- **Plan:** [TECH-REFACTOR-001-plan.md](../architecture/TECH-REFACTOR-001-plan.md)
- **Branch:** `refactor/architecture` (uncommitted working tree)
- **Reviewer:** team lead
- **Date:** 2026-10-18

## 1. Delivery summary

| Scope | Sub-agent | Tests | Result |
|---|---|---|---|
| §2.1 Page agent + Probe | 1 | 30 (2 files) | Accepted |
| §2.2 ExtensionBrowser, HAR, mock, factory, context | 2 | 29 (4 files) | Accepted |
| §2.3 Rule engine + 3 rules | 3 | 54 (5 files) | Accepted |
| §2.4 Build, manifests, lint | 4 | 6 (1 file) | Accepted |
| §2.5 Use case + UI integration | 5 | 37 (4 files) | Accepted after one rework round (R1, R2) |
| Harness smoke test | lead | 1 | n/a |

**Total:** 17 test files, 157 tests.

## 2. Quality gates

### Gate 1: TDD execution: PASS (with one noted gap)

- Every sub-agent report includes red-run output captured before implementation, mostly "module not found" on the first run.
- Sub-agent 2's factory test and sub-agent 5's R1 tests failed on assertions against the old behaviour. These are the strongest evidence.
- **Gap:** sub-agent 5 wrote two small pure UI helpers (`best-practices-view.ts`, `start-error.ts`) in the same step as their tests, with no separate red run. Accepted given their size; flagged for the next iteration.
- Sub-agent 3 captured verbatim red output for 3 of its 5 files. All 5 are reported as failing on the first run.

### Gate 2: Context isolation & security: PASS

- All panel ↔ page traffic goes through `src/shared/protocol.ts`. `grep` finds no `chrome.*` in `src/app/domain` or `src/app/ui`, and only `src/app/index.tsx` calls `getBrowser()`.
- ESLint enforces that the domain doesn't import `infra/` or `ui/` and doesn't use `chrome` or `browser`. Test files are exempt, so they can import `MockBrowser`.
- `vi.mock` has 0 occurrences. Every boundary uses injected fakes.
- **Firefox footprint:** no static content script; the Probe is injected only while an analysis records, in the top frame only.
- **Permissions:** `scripting`, `tabs`, `browsingData` and `<all_urls>`. `contextMenus` and `activeTab` are removed.
- `page.reload` no longer erases download history.

### Gate 3: Reactive state standard: PASS

- **`NewAnalysis`:** uses `createResource` states, `loading` vs. resolved, with a permission fallback.
- **`PendingAnalysis`:** an explicit `starting | recording | error` machine.
  - `AgentError` codes map to French messages, with "Réessayer" and "Retour" buttons.
  - The flow is stopped if the component unmounts while starting.
- **Store:** `saveError()` is exposed as a signal and rendered by `SaveErrorBanner` (`role="alert"`).

### Gate 4: UI & styling: PASS

- Best practices are grouped by category, with offenders listed and a grey "Non évaluée" badge.
- When aggregating across pages, the worst defined grade wins.
- Expand/collapse uses real `<button aria-expanded aria-controls>`, and the existing Tailwind visual language is kept.
- No component tests exist; Vitest runs in a node environment. Logic was extracted into tested pure helpers.

### Gate 5: Full suite integration: PASS

Re-run by the team lead after the rework, from a clean `dist/`:

```
npm run typecheck → 0 errors
npm test          → Test Files 17 passed (17) | Tests 157 passed (157)
npm run lint      → 0 errors, 1 warning
npm run build     → dist/chrome, dist/chrome.zip, dist/firefox, dist/firefox.zip
```

Generated manifests:

- **Chrome:** `background.service_worker`.
- **Firefox:** `background.scripts` and `gecko.id = bastienhub@gmail.com`.

## 3. Rework round

| Id | Finding | Resolution |
|---|---|---|
| R1 | `url-changed` relied on `getPageInfo()`. A rejection during navigation left the page unclosed, merging two pages. A stale result (old document URL) made every later DOM sample be ignored. | The URL now comes from the event. A failed or stale `getPageInfo()` falls back to an empty title and `domSize` 0, which the next DOM samples fill in. 3 regression tests were added; they were red first. Sub-agent 5 also chose to drop a stale document's title and size, so the new page doesn't show the old page's data. This deviation is accepted. |
| R2 | An `eslint-disable` comment in a domain test was needed to import `MockBrowser`. | The lead excluded `**/*.test.ts` from the domain lint override, and the comment was removed. |

## 4. Accepted deviations and known limitations

- **Lint warning in the browser context:** `browser-context.tsx` triggers a `solid/reactivity` warning on `props.browser`. This is harmless: the app creates the browser once and never changes it. Kept as a visible warning rather than suppressed.
- **Requests lost at start:** a request finishing between the initial `getNetworkRequests()` and the subscription to `onNetworkRequest` can be lost. This was already the case in the legacy code. Fixing it needs dedup by request identity, a candidate for a follow-up.
- **Demo mock timer:** `createDemoMockBrowser()`'s interval is never cleared. It is dev-only and created once.
- **Spy-unfriendly mock:** `MockBrowser` methods are plain async methods. Tests override them as instance properties, which works but isn't spy-friendly.
- **Image rule output:** the detail is now a count, and the per-image lines moved into `offenders`.
- **Rule name:** the new rule is titled "Utiliser des polices standards" (plural).
- **Fonts rule MIME matching:** the MIME check covers `font/*` and `application/font*`, so `application/x-font-*` is detected by file extension only.

## 5. Open items for the owner

1. **Manual smoke test** on real Chrome and Firefox: plan §5. The extension has only been built, never loaded in a browser.
2. **EcoIndex page weight:** confirm transferred vs. decoded size against `ecoindex_reference` (review B9, out of scope).
3. **Final Firefox `gecko.id`:** `bastienhub@gmail.com` is the placeholder. Confirm it before the first AMO submission.
4. **Git:** nothing is committed. Deleted legacy files are unstaged deletions in the working tree. The tech-lead workflow ends with a squash-merge onto `develop`, which does not exist yet; this needs the owner's go-ahead.

## Status

**Status: APPROVED.** The automated quality gates pass. Merge waits on the owner's go-ahead and the manual smoke test (§5).
