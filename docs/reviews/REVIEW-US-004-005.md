# REVIEW-US-004-005: Shortened image names, image comparison dialog

- **Plan:** [TECH-US-004-005-plan.md](../architecture/TECH-US-004-005-plan.md)
- **Stories:** [US-004](../stories/US-004.md), [US-005](../stories/US-005.md)
- **Decisions:** ARCH-DECISION-012 to 016 (009 and 011 amended)
- **Branch:** `feat/image-comparison` (uncommitted working tree)
- **Reviewer:** team lead
- **Date:** 2026-10-19

## 1. Delivery summary

| Scope | Content | Tests added | Result |
|---|---|---|---|
| Lead contracts | `ImageFinding` fields, `image-variants.ts` (ports, subject), `COMPARISON_CACHE_MAX_BYTES`, worker protocol union, `lineFindings` | 3 (`image-rule-helpers.test.ts`) | n/a |
| A (US-004) | `displayImageName`, image lines in `best-practices-view.ts`, `ImageName.tsx`, `BestPractices.tsx` | 40 (32 + 8) | Accepted, no rework |
| B (US-005 domain) | finding fields in both rules, format rule collector, `comparison-subject`, `lru-byte-cache`, `variant-store` | 45 new + rule tests extended | Accepted after R1 |
| C (US-005 infra) | `createImagePipeline` (estimate / inspect / generate), worker routing, `WorkerImageEstimator` as `ImageVariantGenerator`, dev fake, factory type, CSP guard test | 32 (+ 2 manifest cases) | Accepted, no rework |
| D (US-005 UI) | format/layout helpers, comparison controller, `ComparisonDialog.tsx`, `comparison-context.tsx`, clickable names, `index.tsx` | 30 + 2 view tests | Accepted after R1 |
| R1 (rework) | linear subject lookup, 50 ms threshold restored | 1 | Accepted |

**Total:** 42 test files, 594 tests (baseline 35 files, 416 tests).

## 2. Quality gates

### Gate 1: TDD execution: PASS (with noted gaps)

- **Lead:** `lineFindings` tests were run red (`lineFindings is not a function`, 3 failed) before the helper existed.
- **A:** both test files red on load (`Failed to load url ./image-name`). Gap: the load error hid the specific `lines` assertions of `best-practices-view.test.ts`; they were written before the code and are green now.
- **B:** red runs recorded: 11 failing rule/helper/registry tests (e.g. `optimisedFormatsRule.collect is not a function`, `expected undefined to deeply equal { width: 1200, height: 800 }`), and "Failed to load url" for the three new modules.
- **C:** red runs recorded for the worker estimator (14 failing, `estimator.loadOriginal is not a function`), the fake estimator and the factory.
  - **Gap:** `pipeline.ts` was written before its new tests; C produced the red run by swapping in the HEAD version (`5 failed`, `createImagePipeline is not a function`). Accepted (tests assert the stories' behaviour), flagged as in the previous epic.
  - The CSP guard test passed immediately: it protects an existing property (no `img-src`/`default-src`), so it is a regression guard by design.
- **D:** red runs recorded ("Failed to load url ./comparison-layout", controller module missing, 3 failed view tests including the S12 assertion).
- **R1:** the new 300-subject performance test passed before the fix (≈ 31 ms for a 50 ms budget), so it has no red run; the measured gain is ≈ 31 ms → 1.5 ms.

### Gate 2: Context isolation & security: PASS

- `vi.mock(` has 0 occurrences in `src` and `scripts`. Every boundary uses injected fakes (`FakeVariantGenerator`, fake store, fake `objectUrls`, fake `WorkerLike`, fake codecs).
- `src/app/domain` imports neither `infra/` nor `ui/`, and uses no DOM type (`Blob`, object URLs) — ESLint clean. Bytes cross the port as `Uint8Array`.
- **Worker:** the dialog reuses the single codec worker; the chunk is still a classic IIFE with no `import.meta` on both targets. Buffers are transferred; `generate` posts a copy so the cached original is never detached (tested). The estimation messages are unchanged on the wire.
- **CSP:** unchanged (`script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`), no `img-src`/`default-src` → `blob:` images allowed; now asserted in `scripts/manifest.test.mjs`.
- **Privacy:** originals come from DevTools content, else the same cache-first panel re-fetch as the estimation (ARCH-DECISION-010). Nothing is persisted or sent to a third party; README "Vie privée" updated.
- Permissions, Chrome 103 / Firefox 109 minimums and `gecko.id` `bastienhub@gmail.com` unchanged.

### Gate 3: Reactive state standard: PASS

- Per version `idle | loading | loaded | error` (`VersionState` in `comparison-controller.ts`), plus the selected version, the display mode, `changed` and `referenceBytes`. Dialog-local; nothing global except the session cache; nothing persisted.
- Errors: `original-unavailable`, `generation-failed`, `display-failed`, each with "Réessayer" retrying only that version (tested).
- Late results after close or from an earlier opening are ignored and create no object URL; every object URL of an opening is revoked once on close (tested). In-flight generations are owned by the store and fill the cache after close (S14, tested).
- Double opening ignored (S15, tested); cached versions shown synchronously through `peek*` (S8, tested).

### Gate 4: UI & accessibility: PASS (code review; browser checks pending)

- US-004: short name `aria-hidden`, full name in `sr-only` text and `title`; the name is `whitespace-nowrap`; legacy lines unchanged (S9, tested).
- US-005: native `<dialog>` with `showModal()`, `aria-labelledby` on the title; radio group of native inputs (arrow keys); "Taille réelle" checkbox with a visible label (checked + disabled with "Image non affichée sur la page" when not displayed); `role="status"` for loading, `role="alert"` for errors; alt texts such as "Version AVIF de photo.jpg, 1200 × 800 px, 96 ko"; Escape, backdrop and "Fermer" close, focus returns to the trigger or to the re-rendered button with the same `data-comparison-key`.
- Only offenders are buttons (S12, tested).
- All French strings are the story's, verbatim, in `comparison-format.ts` (tested).
- No component tests exist in this project: the `.tsx` wiring was reviewed by the lead and compiles/lints; behaviour is covered by manual checks §6.

### Gate 5: Full suite integration: PASS

Re-run by the team lead on the final tree:

```
npm run typecheck → tsc --noEmit, 0 errors (exit 0)
npm test          → Test Files 42 passed (42) | Tests 594 passed (594)
npm run lint      → ✖ 1 problem (0 errors, 1 warning)   [known: browser-context.tsx solid/reactivity]
npm run build     → Built dist/chrome, Created dist/chrome.zip, Built dist/firefox, Created dist/firefox.zip
```

| Check | Chrome | Firefox |
|---|---|---|
| CSP `extension_pages` | `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` (no `img-src`/`default-src`) | same |
| Minimum version | `minimum_chrome_version` 103 | `gecko.strict_min_version` 109.0, `gecko.id` `bastienhub@gmail.com` |
| Worker chunk `codec.worker-d49b3d2a.js` (132 869 B) | starts `(function(){"use strict";`, 0 `import.meta` | same |
| Worker loader `codec.worker-8a15ee76.js` (114 B) | panel ES module (`import.meta.url`, expected) | same |
| `.wasm` assets | 9 separate files | 9 |
| `dist/<target>` | 6 344 kB (before: 6 324 kB, "6.2 MB") | 6 344 kB |
| Zip | 2 111 kB (before: 2 104 kB) | 2 111 kB |

## 3. Rework rounds

| Id | Finding | Resolution |
|---|---|---|
| R1 | Lead review of D: `comparisonSubjectFor` parsed every finding URL (`new URL`) once per image line, i.e. O(lines × findings) parses on every aggregation of a recording; D had relaxed the 300-line test from 50 ms to 150 ms. | Re-delegated (foreground). Finding URLs are normalised by the rules, so the requested URL is normalised once and compared as a string. 300 subjects: ≈ 31 ms → 1.5 ms; the 50 ms threshold is restored. |

## 4. Deviations and lead decisions

See plan §3:

- **L1 (deviation from US-004 §2 rule 4):** characters are counted as user-perceived characters (code points with combining marks, ZWJ sequences, variation selectors, skin tones, tags and flag pairs glued), because counting raw code points would split the emoji of scenario 8. Identical to a code-point count for ordinary names. No `Intl.Segmenter` (Firefox < 125).
- **L2:** the format rule now has a page collector for the display boxes (one more `executeScript` per collection).
- **L3:** findings without a display box (older analyses) open in "Taille réelle" with the "not displayed" hint.
- **L4:** the dialog shows the recorded weight and computes gains against it while the image is unchanged, so its figures equal the best-practice line; it uses the current bytes when the image changed (S11).
- **L5:** "image changed" for older findings without `sourceBytes` uses a `max(2 kB, 2 %)` tolerance.
- **L6:** stopping the analysis terminates the worker, so a generation still running after its dialog closed fails and is not cached.
- **L7:** alt texts for versions other than the story's AVIF example.
- **L8:** "Les deux" has no persisted per-image estimate; equality with the combined estimate is guaranteed by the shared job key and pipeline (tested at pipeline level with real WASM).
- **L9:** a negative gain would show "+X ko (+Y %)".

## 5. Known limitations

- **No browser run yet:** the dialog (`showModal`, focus return, backdrop/Escape handling, scroll restore on `load`, page-mode width measured on open and on resize) is compile- and lint-checked only.
- `inspect` does not apply `MAX_IMAGE_PIXELS`; a huge original is shown and its variants fail with "La version optimisée n'a pas pu être générée." (offenders are below the caps, so this only concerns an image that changed since the analysis).
- `inspect` decodes outside the shared decode cache when the header cannot be read (rare).
- Page-mode width uses the image area's `clientWidth`, padding included (a few pixels).
- Still open from earlier work: the `browser-context.tsx` lint warning.

## 6. Manual checks still needed (owner, real browsers)

1. Chrome ≥ 103 and Firefox ≥ 109: long names shortened, full name on hover and read by a screen reader; layout unchanged when a name becomes a button.
2. Open an offender of each rule and a double offender (from both lists): toggle, info, gain, "Les deux"; sizes equal the line's estimates.
3. "Taille réelle" on a 2x screen (1200×800 drawn at 600×400 CSS px); scroll position kept when toggling.
4. AVIF and WebP displayed from `blob:` URLs with no CSP error in the panel console of both browsers.
5. Escape, backdrop click and "Fermer" close the dialog; focus returns to the name, also while a recording re-renders the list.
6. Saved analysis in a new DevTools session: original re-downloaded, variants generated; a 404 image shows "Image originale indisponible." with "Réessayer".
7. Close during "Les deux" generation, reopen after a few seconds: instant. Double-click on a name opens one dialog.
8. The panel stays responsive during generation, and a recording in progress keeps estimating.
9. `npm run dev`: the dialog opens on the fake estimator's SVG images, with no `.wasm` fetched.

## 7. Open items for the owner

1. The manual checks in §6.
2. Deviation L1 (character counting) and decisions L2–L9: confirm or override.
3. **Git:** nothing is committed. New files are untracked (`docs/stories/US-004.md`, `US-005.md`, ADR 012–016, the plan and this review, `src/app/domain/image-comparison/`, `src/app/domain/models/image-variants.ts`, `src/app/ui/analysis/comparison/`, `image-name.ts`, `ImageName.tsx`).

## Status

**Status: APPROVED.** All automated quality gates pass on both targets. US-004 and US-005 are DONE pending the manual browser checks in §6; merge waits on the owner's go-ahead.
