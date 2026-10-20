# ARCH-DECISION-020: Preview subjects come from the line references; rules persist what the name previews

- **Status:** Accepted (EPIC-PV, US-015 to US-018)
- **Amends:** [ARCH-DECISION-017](ARCH-DECISION-017-line-refs-for-file-names.md) (`LineRef` gains `preview`), [ARCH-DECISION-013](ARCH-DECISION-013-comparison-subject-from-findings.md) (same idea for non-image rules)

## Context

EPIC-PV makes the shortened name of a BP2 line a button opening a preview. The lines of these rules are persisted strings plus `lineRefs` (`{ url, prefix? }`, 017). To open the right modal, the UI needs, per line:

- **what the file is**: image, video, sound, iframe or font. The prefix is not enough: a US-006 `<img>` line and an `<area>` line look the same ("hero.jpg : alternative absente"), and `<area>` must stay plain text;
- **the CSS display box** of the element, for "Même taille que sur la page" (US-015, US-016). It comes from the page at the latest collection. Page data is not persisted, and US-013 has no collector;
- **the iframe position** for US-017. It is in the line text ("située à 2 100 px…"), but parsing French wording back is fragile (rejected in 015 and 017);
- **recorded network data**: MIME type, transferred bytes, the sum of a video's partial `206` responses (US-016), the iframe document request (US-017).

The modal must also work on saved analyses (epic §6), including refs saved before the epic, where an unknown value behaves as "unknown".

Options considered:

1. **A new parallel array on `BestPractice`** (`previews[]`). Rejected: a third array to keep aligned with `offenders` and `lineRefs`, for data that belongs to one line.
2. **Infer everything from the rule id, the prefix and the text.** Rejected: `<area>` lines are ambiguous, and the box and position are not in the text.
3. **An optional `preview` on each `LineRef`, set by the rule; network data read from the page's requests at rendering time (chosen).**

## Decision

- **Persisted data** (`domain/models/best-practice.ts`): `LineRef.preview?: LinePreview`, where

  ```ts
  type LinePreview =
    | { kind: "image"; display?: PreviewBox }
    | { kind: "video"; display?: PreviewBox }
    | { kind: "audio" }
    | { kind: "iframe"; top?: number }
    | { kind: "font" };
  ```

  - `display` is the element's CSS box at the latest collection, rounded. It is undefined when the collector failed, and `0 × 0` when the element is not displayed.
  - `fileLine(url, rest, prefix?, preview?)` (`rule-lines.ts`) sets it. Only capped lines (20 at most) carry it, so a page gains at most a few hundred bytes per rule.
  - `<area>` lines get no `preview`, so they stay plain text.
- **Collectors:**
  - US-006 adds the box of every `img`, `input[type=image]` and `video`, with **one** `getBoundingClientRect` per element. `area` gets no box.
  - US-007 reuses the rect it already reads (`width`/`height` next to `top`), and passes `top` to iframe lines.
  - US-014 adds the box of every `video`.
  - US-013 gets its **first collector**: the largest `<img>` box per URL (`currentSrc || src`), deduplicated in the page to keep the JSON small. A GIF without any `<img>` gets `0 × 0`; when the collector failed, `display` is undefined. Both open in "Taille réelle".
  - The rules stay isolated (ARCH-DECISION-004): US-013 does not read the format rule's collector.
- **US-018:** `UseStandardFonts` builds its lines with `fileLine(url, " : " + formatKo(size), "", { kind: "font" })`. There is one line per URL (last request), sorted by size descending, then URL, through `capLines`. The size is the transfer size, else the body size, as in US-013. The grade and the detail are unchanged. Older analyses have URL-only lines without `lineRefs`, which render as plain text (scenario 8).
- **Subjects** (`domain/file-preview/preview-subject.ts`, pure):
  - `createPreviewSubjectResolver(page.requests)` returns `(ruleId, ref) => PreviewSubject | undefined`. It indexes the requests by URL without fragment once, lazily. The UI builds one resolver per page and per rendering.
  - The subject is undefined when the URL is not `http(s)` (`blob:`, `data:`: epic §1), or when the kind is unknown.
  - `ref.preview ?? legacyLinePreview(ruleId, ref.prefix)` gives the kind. For legacy refs: `LimitGifs` gives image; `UseLazyLoading` gives image, or iframe with "Iframe "; `AvoidMediaAutoplay` gives video ("Vidéo ") or audio ("Son "); `ProvideTextAlternatives` gives video with "Vidéo ". **Unprefixed US-006 legacy lines stay plain**, because they cannot be told from `<area>` lines.
  - From the requests:
    - `declaredType`, the MIME type of an image or font: the last non-empty type, else "".
    - `mimeType` of a medium or iframe: the same, else undefined.
    - `downloadedBytes` of a medium: the sum over **all** its requests (partial `206` included) of the transfer size, or the body size when served from the cache. It is undefined when no request was recorded ("non téléchargé par la page").
    - `recordedStatus` of a medium: the HTTP status of its last request (ARCH-DECISION-023).
    - `transferredBytes` of an iframe: the transfer size of its last request, else undefined ("non mesuré").
    - `host`: the URL's `hostname`.

## Consequences

- No migration. Older pages lack `preview` and open with unknown values: no box, so "Taille réelle"; position "inconnue".
- Subjects are snapshots taken at rendering time; the dialog keeps the one of the clicked line (as in 016).
- A rule that changes its wording must keep the `prefix + fileLabel(url)` start (017); otherwise its lines fall back to plain text and lose the button.
- US-013 now costs one `executeScript` per collection, run in parallel with the others.
