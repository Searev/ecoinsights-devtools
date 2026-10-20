# ARCH-DECISION-015: Image lines are rendered by pairing the persisted line strings with their findings; no persistence change

- **Status:** Accepted (US-004)

## Context

US-004 shortens image file names and puts the full name in a `title` and in the accessible name; US-005 then makes the name of offender lines a button. Both image rules persist their lines as pre-formatted strings (`BestPractice.offenders`, e.g. `photo.jpg : 1200×800 pour un affichage en …`) and their per-image data separately (`BestPractice.images`). The story asks to render lines "from the structured findings", keep the rest of each line, and keep the legacy display for analyses without `images`. The CSV export is unchanged.

Options considered:

1. **Persist a structured line per finding** (new `BestPractice` field). Rejected: a schema change for display only, and analyses saved between US-001 and US-004 would still need a fallback.
2. **Re-create every line's text in the UI from the findings.** Rejected: duplicates the rules' French wording; the resize line needs the display box and density, which only recent findings carry.
3. **Pair each persisted line with its finding (chosen).**

## Decision

- `lineFindings(findings)` (`domain/best-practices/rules/image-rule-helpers.ts`) returns the findings that get a line, **in line order**: offenders by gain (desc, then URL), then not-evaluated images; empty while any is pending. `summariseImageFindings` builds its lines from it, so the order cannot drift (tested).
- Every image line starts with `` `${fileLabel(url)} : ` ``. The UI helper (`ui/analysis/best-practices-view.ts`) zips `offenders[i]` with `lineFindings(images)[i]` and keeps the pair only if the line starts with that prefix; the rest of the line (after the prefix) is displayed after the name element. Any mismatch, the "… et N autres images" line, a rule without `images` (legacy, other rules) → the line is rendered as plain text, exactly as before (US-004 scenario 9).
- The display name is a pure helper, `displayImageName(url)` → `{ short, full }` (`ui/analysis/image-name.ts`), counting Unicode code points.
- **Accessibility:** the visible short name is `aria-hidden`; the full name is in visually hidden text (`sr-only`) and in `title`. One single-line element (`whitespace-nowrap`), so US-005 can turn it into a `<button>` without layout change.
- Lines are deduplicated across pages by their full string, as `offenders` already are.

## Consequences

- No stored data changes; the CSV export, which uses `offenders`, is untouched.
- A rule that changes its line wording must keep the `fileLabel : ` prefix, or its lines fall back to plain text (visible, not broken).
