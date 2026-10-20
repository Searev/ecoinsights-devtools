# ARCH-DECISION-011: Image gain model: original weight, image identity, scope and combined page gain

- **Status:** Accepted (US-001 to US-003)
- **Amended by:** [ARCH-DECISION-013](ARCH-DECISION-013-comparison-subject-from-findings.md) (optional finding fields `natural`, `display`, `sourceBytes`, US-005)

## Context

The three stories define gains as `originalBytes − estimatedBytes` with `originalBytes` = "transferred size", grade on the share of image weight, and count the page gain only for images transferred by the page. Several points needed a precise, shared definition so that the two rules and the US-003 aggregation agree.

## Decision

1. **Image identity is the URL without fragment** (`normaliseImageUrl`). `<img>` elements are matched to network requests by that URL (`findImageRequest`: last 2xx or 304 response). The same URL shown several times on a page is evaluated once, with the **largest** required size of its occurrences (the file is downloaded once and must cover the biggest box).
2. **Original weight** (`originalBytesOf`, `src/app/domain/image-estimation/image-requests.ts`):
   1. the transfer size when the page downloaded the image (2xx and `transferSize > 0`);
   2. else the body size (`responseSize`), for an image served from cache or revalidated (304). Otherwise a cached image would always show a gain of 0, and US-001 scenario 11 ("each page lists it with the same estimated gain") would fail;
   3. else the byte length obtained by the estimator;
   4. else unknown: the image is left out of the share.
3. **Grade:** with integers, `gain × 10 < total` → A; `gain × 10 ≤ total × 3` → B; else C (A < 10% ≤ B ≤ 30% < C, exact at the boundaries). No evaluated weight → A.
4. **Evaluated weight (denominator):**
   - US-001: in-scope images (not SVG, `data:`, GIF, 0-size or not loaded) that are either correctly sized or oversized and estimated. Skipped, failed and pending images are excluded.
   - US-002: JPEG/PNG images estimated (offender or not) plus WebP/AVIF images (already compliant). Out-of-scope formats are excluded.
5. **Format detection:** the response MIME type; for a missing or generic type, the file signature, decided in the codec (`formatFromMime` returns `"generic"`). The extension is never used by US-002. US-001 additionally excludes SVG and GIF by URL extension when the MIME type is unknown, because these images must not be fetched at all.
6. **Out of scope with no codec:** GIF (static or animated), BMP, ICO, TIFF → `skipped(unsupported-format)`; animated PNG/WebP → `skipped(animated)`. Neither listed nor counted.
7. **Combined page gain (US-003)**, `src/app/domain/image-estimation/image-gain.ts`:
   - over the union of both rules' findings, by URL, restricted to images **transferred by the page** (`isTransferred`);
   - offender of one rule only → that rule's gain; of both → a `resize-convert` job at the US-001 target size, in the US-002 recommended format;
   - combined estimate failed or skipped → fallback `max(resizeGain, formatGain)` and `fallbackCount + 1` (page shown "partiel");
   - any of the image's findings still pending, or the combined job pending → `pendingCount + 1`, contributes 0 (the displayed value is a lower bound, "≥");
   - neither an offender, with one finding failed or skipped for `too-large` / `analysis-stopped` → `notEvaluatedCount + 1`;
   - each counted gain must reach the 10 kB noise threshold.
8. **Persistence:** `PageAnalysis.imageGain = { bytes, pendingCount, notEvaluatedCount, fallbackCount }`; status is derived (`pending` if `pendingCount > 0`, `partial` if `notEvaluatedCount + fallbackCount > 0`, else `complete`). Legacy pages have no `imageGain`: shown "—", empty CSV cell, ignored in totals.
9. **Units:** 1 kB = 1 000 bytes, 1 MB = 1 000 000 bytes, consistent with `requestSizeInKb`.

## Consequences

- The per-page gain of a cached image may differ by a few hundred bytes (headers) from the page where it was downloaded; it rounds to the same kB in practice.
- Both rules and the aggregation import the same helpers, so they cannot drift.
