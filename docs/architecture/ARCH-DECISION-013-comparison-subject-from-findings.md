# ARCH-DECISION-013: The comparison dialog is driven by the persisted findings, extended backward-compatibly; the format rule collects display boxes

- **Status:** Accepted (US-005)
- **Amends:** [ARCH-DECISION-011](ARCH-DECISION-011-image-gain-model.md) (finding fields)

## Context

The dialog must work on a recording and on saved analyses (US-005 scenario 7), so everything it needs must be in the persisted `BestPractice.images` (`ImageFinding[]`): URL, natural size, CSS display size, target size, source format, recorded original size, and which variants exist. `ImageFinding` (ARCH-DECISION-007) has no natural size, no display size and no record of the byte length the estimator saw. The format rule has no collector at all: it knows images only from network requests, so it cannot tell how big they are displayed.

## Decision

### Finding fields (all optional, `src/app/domain/models/image-estimation.ts`)

| Field | Set by | Meaning |
|---|---|---|
| `natural` | resize rule: the `<img>` natural size; both rules: the estimation outcome's `width`/`height` when estimated | Natural pixel size |
| `display` | resize rule: the largest box of the URL (already computed); format rule: from its new collector, `{0, 0}` when no `<img>` of the page displays the URL | CSS box on the page |
| `sourceBytes` | `findingFromState`, state `estimated` (`outcome.sourceBytes`) | Byte length the estimator obtained |

Findings saved before US-005 simply lack them; `store-codec.ts` already passes findings through untouched, so no migration is needed.

### Format rule collector

`UseOptimizedImageFormats` gets a `collect()` returning `{ images: [{ src, displayWidth, displayHeight }] }` for every `<img>` (`currentSrc || src`, `getBoundingClientRect`). It is used only for `display`; the rule's scope and grade are unchanged (still from network requests). Cost: one more `executeScript` per collection, run in parallel with the others.

- Rejected: reading the resize rule's page data from the format rule. Rules are isolated (ARCH-DECISION-004); a cross-rule input would make the engine order-dependent.
- Rejected: taking the display box from the resize finding only. The resize rule lists only oversized images, so most format offenders would have no box.

### Comparison subject (`src/app/domain/image-comparison/comparison-subject.ts`)

`comparisonSubjectFor(bestPractices, ruleId, url)` is pure and returns a `ComparisonSubject`, or `undefined` when the finding of `ruleId` for `url` is not an offender (US-005 scenario 12: only offenders are clickable).

- **Versions** (product decision of the story), in toggle order:
  - always `original` ("Originale");
  - resize offender → `resized` ("Redimensionnée"), job `resize` at `target`;
  - format offender → `converted`, labelled `encodingLabel(finding.encoding)` ("AVIF" or "WebP sans perte"), job `convert`;
  - offender of **both** rules (whatever the list) → both variants plus `both` ("Les deux"), whose job is **exactly** the US-003 combined job (`resize-convert` at the resize target, `declaredType` of the resize finding else the format finding), so its `estimationKey` equals `planCombinedEstimations`'.
- `estimatedBytes` of each version comes from its finding (`resize`/`convert`) or is undefined for `both` (the combined estimate is not persisted per image).
- `display`: the resize finding's box if any, else the format finding's.
- `natural`: the first known of the two findings.

### Image changed, reference weight

Pure helpers in the same module:

- `hasImageChanged(subject, currentByteLength)`: with `recordedSourceBytes` known, any difference; without it (legacy finding), a difference over `max(2 000 bytes, 2 %)` of `recordedBytes` (the recorded weight may be a transfer size, headers included). `recordedBytes` 0 → never "changed".
- `referenceOriginalBytes(subject, currentByteLength)`: `recordedBytes` when the image did not change and it is known, else the current length. The dialog shows it as the original's size and computes every gain against it, so an unchanged image shows exactly the figures of its best-practice line (US-005 scenarios 1, 2), and a changed one is computed from the current bytes (scenario 11).

## Consequences

- Legacy findings open the dialog in "Taille réelle" (no display box) and never show the "image changed" notice unless the weight differs clearly.
- The same image on two pages may have two subjects (different targets); the dialog uses the one of the clicked line.
