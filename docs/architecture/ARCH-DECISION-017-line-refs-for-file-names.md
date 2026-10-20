# ARCH-DECISION-017: BP2 rules link their lines to files with `lineRefs`; the UI shortens the names

- **Status:** Accepted (EPIC-BP2, US-006 to US-014)
- **Amends:** [ARCH-DECISION-015](ARCH-DECISION-015-image-lines-from-findings.md) (adds a second pairing source, for rules without image findings)

## Context

EPIC-BP2 §5 asks every offender line that names a file to use the US-004 display name: shortened, with the full name on hover and for assistive technologies. Today the UI can do this only for the two image rules: it pairs each persisted line with an `ImageFinding` through `lineFindings` (ARCH-DECISION-015). The nine new rules have no findings, and their names are not always at the start of the line:

- `Vidéo intro.mp4 : ni sous-titres ni libellé` (US-006), `Iframe map.html : …` (US-007), `Son jingle.mp3 : …` (US-014);
- `vendor.js (JS, 250 ko) : non compressé` (US-008, US-010): the name is followed by " (", not " : ";
- `example.org : 3 requêtes, 120 ko` (US-011, US-012): a domain, not a file.

Options considered:

1. **Parse the file name back from the line text.** Rejected: ambiguous (names can contain " : " or " ("), and the text has no URL.
2. **Persist a structured line per offender** and rebuild the text in the UI. Rejected for the same reasons as in 015: it duplicates the French wording in the UI, and the CSV export uses `offenders`.
3. **Persist, next to `offenders`, a parallel array of references to the file each line names (chosen).**

## Decision

- `BestPractice.lineRefs?: (LineRef | null)[]`, where `LineRef = { url: string; prefix?: string }` (`domain/models/best-practice.ts`). `RuleResult.lineRefs` has the same shape, and `evaluateRules` copies it.
  - One entry per `offenders` line, in the same order. `null` means the line names no file: domains, the "… et N autres" line, media without a source.
  - The line text **must** start with `(prefix ?? "") + fileLabel(url)`, where `fileLabel` is the existing image-rule helper (decoded last path segment, else host).
- Rules build their lines with `fileLine(url, rest, prefix?)` and `capLines(lines)` (`best-practices/rules/rule-lines.ts`). `capLines` applies the epic's 20-line cap with "… et N autres" ("… et 1 autre"). It omits `lineRefs` when no line names a file.
- UI (`ui/analysis/best-practices-view.ts`): a rule with `images` keeps the 015 path. Otherwise, line `i` with a non-null `lineRefs[i]` whose text starts with `prefix + fileLabel(url)` becomes a `{ kind: "file" }` line: `prefix`, then the shortened name (`displayImageName(url)`, rendered by the existing `ImageName` without a comparison button), then the rest of the text. Any mismatch → plain text, as for 015.
- Lines are still deduplicated across pages by their full text.

## Consequences

- Persisted pages gain an optional array of small objects for the BP2 rules only. Older analyses have none and render as before. The CSV export is unchanged.
- A rule that changes its wording must keep the `prefix + fileLabel(url)` start, or its lines fall back to plain text: visible, not broken.
- The 20-line cap and its wording are shared by the nine rules. The image rules keep "… et N autres images".
