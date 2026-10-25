# ARCH-DECISION-033: A persisted per-page indicator computed by `evaluate()`, aggregated in the view

- **Status:** Accepted
- **Story:** US-029
- **Amends:** [ARCH-DECISION-004](ARCH-DECISION-004-stateless-best-practice-rules.md). `RuleResult` and `BestPractice` gain one optional field.

## Context

US-029 shows "offenders / expected" for each best practice, per page and for the whole journey. The indicator must never contradict the grade, the detail or the lines. Analyses saved before the story show none and are never recomputed.

Options considered:

1. **Derive the indicator in the UI from `offenders` / `detail`.** Rejected: lines are capped at 20, deduplicated across pages, and sometimes grouped (hosts for HTTP/2); the "expected" set is not in the result at all. Parsing French details is fragile.
2. **Recompute it in the UI from the persisted requests.** Rejected: DOM rules have no persisted page data, and it would be a second pass with other filters, which the story forbids.
3. **Each rule's pure `evaluate()` returns it, from the sets it already builds, and the page result persists it (chosen).**

## Decision

- **Shape** (`domain/models/best-practice.ts`), a discriminated union persisted as is:
  - `{ kind: "ratio"; offenders; expected; unit: RatioIndicatorUnit }`
  - `{ kind: "count"; offenders; unit: CountIndicatorUnit }`
  - `{ kind: "presence"; present: boolean; unit: PresenceIndicatorUnit }`

  The units are stable string keys (`RATIO_INDICATOR_UNITS`, `COUNT_INDICATOR_UNITS`, `PRESENCE_INDICATOR_UNITS`), not French text. The view maps them to singular and plural labels with an exhaustive `Record`, so wording can change without a migration. The stored payload is about 60 bytes per rule per page.
- **Rules:** `RuleResult.indicator` is set only with a `compliance`. It is never set while pending, for "Non évaluée", or by `UseLazyLoading`. `evaluateRules` copies it and drops it when `compliance` is undefined, which guards the invariant once for every rule.
- **Persistence:** `parseStoredData` keeps a stored `indicator` only if `isBestPracticeIndicator` accepts it: a known kind and unit, finite non-negative integers, and `offenders <= expected` for a ratio. Otherwise it removes it. Legacy pages have none.
- **Aggregation and wording** are pure helpers in `ui/analysis/best-practices-view.ts`:
  - `formatIndicator`;
  - the journey indicator: ratios summed, counts as the worst page, presence as "absente sur k pages sur n";
  - per-page indicators parallel to `pages`.

  Pages without a compliance or an indicator are ignored. No indicator is shown while any page of the rule is in progress.

## Consequences

- Every rule except `UseLazyLoading` has to keep its indicator in step with its grade. Each rule test asserts it next to the detail.
- A new unit is three edits: the union array, the view label table (a compile error if missing), and the rule.
- The CSV export is unchanged (out of scope).
