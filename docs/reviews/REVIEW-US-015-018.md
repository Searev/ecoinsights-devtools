# REVIEW-US-015-018: Epic PV, preview the elements flagged by the best practices

- **Plan:** [TECH-US-015-018-plan.md](../architecture/TECH-US-015-018-plan.md)
- **Stories:** [EPIC-PV](../stories/EPIC-PV-conventions.md), [US-015](../stories/US-015.md), [US-016](../stories/US-016.md), [US-017](../stories/US-017.md), [US-018](../stories/US-018.md)
- **Decisions:** ARCH-DECISION-020, 021, 022, 023. They amend 013, 016 and 017.
- **Branch:** `feat/best-practices-bp2` (uncommitted working tree, on top of the uncommitted US-006 to US-014 work)
- **Reviewer:** team lead
- **Date:** 2026-10-21

## 1. Delivery summary

| Scope | Content | Tests (files of the scope) | Result |
|---|---|---|---|
| Lead contract | `LinePreview` / `LineRef.preview`, preview model and ports, `MAX_PREVIEW_BYTES`, `fileLine(…, preview)`, `createPreviewSubjectResolver`, `createPreviewFileStore`, `createSessionFileCache`, the variant-store `cache` option, `InfoRow` and `PreviewInfoList`, CSP guard | +36 | n/a |
| A1 (US-006, 007, 014) | CSS boxes in three collectors (one `getBoundingClientRect` per element), preview refs, `area` without preview | 87 in 3 files | Accepted, no rework |
| A2 (US-013, US-018) | first `LimitGifs` collector (largest `<img>` box per URL); font lines "name : weight" with refs | 45 in 2 files | Accepted, lead comment fix (L2) |
| B (bytes) | `createPreviewFileLoader`, `describePreviewImage` (GIF/BMP/ICO/SVG readers, GIF animation), `detectFontFormat`, dev fake, `getPreviewFileLoader` | 77 new | Accepted, no rework |
| D (US-015) | image format, layout and controller; `ImagePreviewBody` | 46 | Accepted, no rework |
| E (US-016, US-017) | duration and media format, `mediaErrorKind`, media controller, `releaseMedia`, iframe rows; `MediaPreviewBody`, `IframePreviewBody` | 113 | Accepted, no rework |
| F (US-018) | Voltaire sample and stacks, `FontRegistry` on `document.fonts`, font controller; `FontPreviewBody` | 28 | Accepted, no rework |
| C (wave 2) | `createDialogHost`, `AppDialogProvider` / `useAppDialog`, `ComparisonBody`, clickable `ImageName`, preview subjects in `best-practices-view.ts`, `index.tsx` wiring | 17 | Accepted after lead fix L1 |
| Lead integration | registry test (`LimitGifs` collector), docs | +1 | n/a |

**Total:** 77 test files, 1 334 tests (baseline 59 files, 977 tests; after the contract wave, 62 files and 1 013 tests).

## 2. Quality gates

### Gate 1: TDD execution: PASS (with noted gaps)

- **Lead contract.** Red recorded before implementation:
  - "Failed to load url ./preview-subject", "../image-comparison/session-file-cache" and "./session-file-cache";
  - 2 `rule-lines` assertions (`expected [ { url: 'https://x.test/a.gif' } ] to deeply equal [ { …(2) } ]`);
  - 8 preview-store failures (`expected [] to have a length of 1`) on a first implementation that called the loader asynchronously, fixed to the variant store's synchronous call.
  - The registry test was red on `LimitGifs` before the lead updated it.
- **A1:** 20 assertion failures, e.g. `expected undefined to deeply equal { kind: 'audio' }`.
- **A2:** 16 failures in `limit-gifs` (`limitGifsRule.collect is not a function`) and 7 in `standard-fonts` (URL lines).
- **B:** 4 load failures, and `getPreviewFileLoader` 2 failed.
- **C:** 6 failed, e.g. `expected +0 to be 1` on the request-read count.
- **D, E, F:** every test file was red on load ("Failed to load url ./<module>") before its module existed.
- **Gaps:**
  - D, E and F have load failures only as red evidence. Their assertions were written beforehand, and the reports show they were green on the first implementation run.
  - The CSP guard (`manifest.test.mjs`) passed immediately. It is a regression guard by design: the manifest needed no change.
  - The comparison refactor (`ComparisonDialog` → `ComparisonBody`) is behaviour-preserving. `comparison-controller.test.ts`, `comparison-format.test.ts` and `comparison-layout.test.ts` are untouched and green.

### Gate 2: Context isolation & security: PASS

- **Isolation:**
  - `vi.mock(` has 0 occurrences in `src`.
  - `src/app/domain` imports neither `infra/` nor `ui/` (ESLint clean).
  - The new port `PreviewFileLoader` is injected like `ImageEstimator`, and `getPreviewFileLoader()` is called only from `index.tsx`.
- **No new permission, protocol entry or Page agent call.**
  - Previews run entirely in the panel. The font is registered in the panel's `document.fonts`, never in the inspected page.
  - The iframe body creates no `<iframe>` and makes no request.
- **SVG** is displayed only through `<img src="blob:…">` with type `image/svg+xml`, so its scripts never run. It is never inlined in the DOM.
- **CSP** is unchanged in both targets. `scripts/manifest.test.mjs` now asserts the absence of `img-src`, `default-src`, `media-src`, `font-src` and `connect-src`.
- **Collectors:**
  - The four collectors stay self-contained: the registry rebuilds them with `new Function` and checks the JSON round-trip.
  - The background bundle builds with the new `LimitGifs` collector; `normaliseImageUrl` is used in `evaluate` only.
- **Persistence:** `LineRef.preview` is optional, and older analyses load unchanged. Bytes are never persisted.
- **Placeholder email** `bastienhub@gmail.com` is unchanged (`gecko.id`).

### Gate 3: Reactive state standard: PASS

- Every body has a pure controller with `idle | loading | loaded | error` states, tested without the DOM:
  - image: `loading` → `loaded` / `error(unavailable | too-large | display-failed)`;
  - media: `loading` until `loadedmetadata`, then `loaded` / `error(unavailable | unsupported)`;
  - font: `idle | loading | loaded | error(unavailable | unsupported)` for "Police téléchargée"; the system stacks are always available;
  - iframe: synchronous, `loaded` on open.
- **Late results** after close, or for an older opening, are ignored:
  - image: no object URL is created (US-015 S12);
  - font: a late registration is released at once (US-018 S9);
  - media: late events after close are ignored.
- **Release on close:** object URLs are revoked, the font is deleted from `document.fonts`, and the media is released (`pause`, remove `src`, `load()`).
- **Reopening is instant:** a cached image goes straight to `loaded` (`peekImage`, S10). Errors are never cached, so "Réessayer" retries for real (S8).
- **Scope:** one host and one preview store per panel session. Bodies are mounted per opening, after `showModal()`, and unmounted on close. The comparison controller is unchanged and driven by the host.

### Gate 4: UI & accessibility: PASS (code review; browser checks pending)

- **One native `<dialog>`** with `showModal()`, labelled by `#app-dialog-title`.
  - The title shows the short name (`aria-hidden`), with the full name `sr-only` and in `title`. Under it is the full URL, selectable and `break-all`.
  - Escape, a backdrop click and "Fermer" close it. Focus returns to the trigger, else to `[data-dialog-key]`. A second open is refused (double click).
- **Names:** they are `<button aria-haspopup="dialog">` with the US-005 classes. Prefixes ("Vidéo ", "Son ", "Iframe ") stay plain text.
  - Not clickable: "(sans source)", domains, "… et N autres", `<area>`, `blob:`, `data:`, legacy font URL lines (tested).
- **Image:**
  - `alt` "Aperçu de hero.jpg, 1200 × 800 px, 180 ko";
  - "Taille réelle" is a labelled checkbox, checked and disabled with "Image non affichée sur la page" when there is no box.
- **Media:** native `controls`, `preload="metadata"`, no `autoplay`, `aria-label` "Aperçu de intro.mp4".
- **Font:** a `<fieldset>` with the visible legend "Police" and native radios. The sample is real text at 32 px.
- **Status and alerts:** loading uses `role="status"` ("Chargement…", "Chargement de la police…"). Errors use `role="alert"` with "Réessayer".
- **Strings:**
  - The French strings match the stories and are tested in the `*-format.ts` helpers, including the Voltaire sample with U+2019 and the three `font-family` stacks verbatim.
  - Weights go through `formatKo`, positions through `formatCount`, and resolutions through `formatResolution`.

### Gate 5: Full suite integration: PASS

- `npm test`, three consecutive runs on a quiet machine: **77 files, 1 334 tests passed**, each time.
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors, 1 known warning (`browser-context.tsx`, pre-existing).
- `npm run build` (both targets): OK. `dist/chrome` and `dist/firefox` are 6.3 MB each (6.2 MB before).
- `npm run lint:firefox` was not run, because `npx --yes web-ext` would download a package. It is in the manual checks.

## 3. Findings and rework

| # | Scope | Finding | Resolution |
|---|---|---|---|
| L1 | C | The test named for US-018 S8 asserted that a ref with an invented "Autre " prefix has no preview. It did not cover the scenario (URL-only lines without `lineRefs`). | Fixed by the lead: the real legacy case (URL offender, no `lineRefs` → text line), plus the unknown-prefix case kept as a separate test. |
| L2 | A2 | A comment in `limit-gifs.rule.ts` said "first matching entry wins", while the code keeps the largest box. | Comment fixed by the lead. |
| N1 | A1, A2 | Under the parallel load of six agents, the US-006 and US-007 jsdom performance tests exceeded 50 ms once (105 ms). | Not reproduced in three quiet full runs. The budgets are unchanged. |
| N2 | A2 | The GIF collector tests stub `document` with plain objects (`vi.stubGlobal`) instead of jsdom. Under jsdom, `URL` was slow enough to break the 10 ms evaluation budget of the existing 2 000-request test. | Accepted: no project module is mocked, and the registry still runs the collector in jsdom. |
| N3 | B | Base64 DevTools content that decodes to a non-image gives `unavailable` directly, with no fallback to fetch. | Accepted: what the page received is not an image. |
| N4 | D | "Réessayer" after "Ce format d'image ne peut pas être affiché." reloads from the session cache, so it shows the same error. | Accepted: the bytes are the same; the button is required by the story. |
| N5 | F | Reopening a cached font goes through `loading` for one microtask (the `FontFace` load is asynchronous). | Accepted: no network access, so there is no visible delay in practice. To confirm in the manual checks. |

**Decisions taken by agents, accepted:**
- **E:** a non-generic MIME type with no mapping gives "inconnu", with no fallback to the extension.
- **B:** an XML file without an `<svg>` root is not an image. TIFF is an image of format "inconnu".
- **C:** the header is in the host; `ComparisonBody` now measures its area in `onMount`, after `showModal()`.

## 4. Lead decisions (plan §2) to confirm with the owner

1. Legacy refs: unprefixed US-006 lines (images) saved before the epic stay plain text, because they are ambiguous with `<area>`. The other rules' legacy refs are clickable.
2. Media weight: the sum of the transfer sizes, or the body size when served from the cache, with partial `206` responses included. Iframe weight: the transfer size of the last request ("0 ko" when served from the cache).
3. Media errors: a 404 and an unsupported source are told apart by the page's own recorded status (`MediaError` 4 + 2xx gives "Ce format n'est pas lu par ce navigateur.").
4. Duration below one hour: "1 min 05 s" (seconds on 2 digits).
5. The alt text omits the resolution when it is unknown or undefined (SVG).
6. Base64 DevTools content (≤ 25 MB) is decoded on the panel thread, after the loading state is shown.

## 5. Manual checks (to do in Chrome ≥ 103 and Firefox ≥ 109)

- [ ] **Dialog:** load the built extension. The dialog opens from each of the five rules and from the image rules (comparison unchanged). Escape, the backdrop and "Fermer" close it, and focus returns to the name.
- [ ] **US-015, images:**
  - JPEG, PNG, WebP and AVIF display, with the right resolution;
  - an animated GIF plays and shows "GIF animé";
  - BMP and ICO display;
  - an SVG with an inline `<script>` displays and the script does not run;
  - an SVG without `width`/`height` shows "non définie (image vectorielle)";
  - "Même taille que sur la page" matches the page;
  - a GIF used only as a CSS background opens in "Taille réelle".
- [ ] **US-015, failures:** a 404 image shows "Image indisponible.", then "Réessayer". An image over 25 MB shows "Image trop volumineuse pour l'aperçu.".
- [ ] **US-016, media:**
  - the player stays paused until play;
  - only metadata is fetched (DevTools-on-DevTools Network panel);
  - closing during playback stops the sound and the download;
  - an unsupported format and a 404 show the right message;
  - `blob:` sources are not clickable.
- [ ] **US-017, iframes:** host, type, weight and position shown; no request in the DevTools-on-DevTools Network panel.
- [ ] **US-018, fonts:**
  - WOFF2 and TTF draw the sample;
  - the three stacks apply;
  - an EOT shows "Ce format de police n'est pas pris en charge par ce navigateur.";
  - after close, `document.fonts` of the panel has no `ecoinsights-preview-*` face;
  - the inspected page's `document.fonts` is unchanged.
- [ ] **Saved analyses:**
  - a saved analysis from this version opens its previews (from the HTTP cache);
  - an analysis saved before shows the font URL lines as plain text.
- [ ] **Measurement isolation:** the requests made by the previews do not appear in the inspected tab's Network panel, and the analysed request count does not change.
- [ ] `npm run lint:firefox` on `dist/firefox`.

## 6. Verdict

All five gates pass. Every Gherkin scenario of US-015 to US-018 is covered by automated tests at the level of pure helpers, controllers, rules and view; the browser-only behaviours are listed in §5.

Stories US-015, US-016, US-017 and US-018: **DONE** (pending the manual checks of §5).

Status: APPROVED
