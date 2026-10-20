# ARCH-DECISION-023: Media are streamed by the native player, fonts are registered from bytes in the panel only, iframes are never loaded; the CSP stays unchanged

- **Status:** Accepted (EPIC-PV, US-016, US-017, US-018)
- **Builds on:** [ARCH-DECISION-016](ARCH-DECISION-016-comparison-dialog-host.md) (CSP without `img-src` / `default-src`)

## Context

- **US-016** plays a video or a sound in the modal:
  - it never autoplays, and only metadata is fetched on open;
  - closing stops playback and the download;
  - the resolution and duration come from the media metadata;
  - errors are "Média indisponible." (network, 404) and "Ce format n'est pas lu par ce navigateur." (unsupported source).
- **US-017** shows iframe data only, and must make no request.
- **US-018** draws a sample in the downloaded font, registered only in the panel and released on close. Errors: "Police indisponible." and "Ce format de police n'est pas pris en charge par ce navigateur." (EOT, corrupt).
- The extension pages CSP is `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. It has no `default-src`, so `media-src`, `font-src`, `img-src` and `connect-src` are unrestricted. This is true in Chrome ≥ 103 and in Firefox ≥ 109.

## Decision

- **Media** (`ui/analysis/preview/media-*`):
  - **Player:**
    - native `<video controls>` or `<audio controls>`, with `preload="metadata"`, `src` = the media URL and no `autoplay` attribute;
    - an accessible name "Aperçu de <full name>".
    - The bytes are not loaded through the preview loader: the player streams them, and the browser's HTTP cache serves them when possible.
  - **Pure controller** `createMediaPreviewController({ canPlayType })`, with these states:
    - `loading` until `loadedmetadata`;
    - `loaded`, with the duration, `videoWidth` and `videoHeight`;
    - `error`.
    - `retry()` returns to `loading` and bumps a reload counter, so the wiring calls `load()`.
  - **Errors** (`mediaErrorKind`). The effective type is the recorded MIME type, else the type implied by the URL extension (`.mp4` → `video/mp4`…):
    - known effective type and `canPlayType(type) === ""` → `unsupported` at once, without loading the source;
    - `MediaError` code 3 (decode) → `unsupported`;
    - code 4 (source not supported) → `unsupported` when the page's last recorded request for the URL succeeded (`MediaPreviewSubject.recordedStatus` 2xx or 304), else `unavailable`. Chrome reports a 404 as code 4, so the status recorded during the analysis is what tells them apart, without an extra request;
    - code 2 (network) and anything else → `unavailable`.
  - **Release on close** (`releaseMedia(element)`): `pause()`, `removeAttribute("src")`, `load()`. This is the standard way to stop playback and cancel the download. It runs in the body's `onCleanup`.
- **Iframe:** the body renders data only (host, type, transferred weight, position) from the subject (ARCH-DECISION-020). It creates no `<iframe>` and makes no request; the `loaded` state is shown on open.
- **Font** (`ui/analysis/preview/font-*`):
  - **Port** `FontRegistry.register(bytes) → { ok: true; family; release() } | { ok: false }`.
    - `createDocumentFontRegistry({ fonts: document.fonts, createFace })` builds a `FontFace("ecoinsights-preview-<n>", buffer, { weight: "normal", style: "normal" })`, awaits `load()`, then adds it to the **panel document's** `FontFaceSet`.
    - `release()` deletes it.
    - A rejected `load()` gives `{ ok: false }`, displayed as "unsupported".
  - Nothing is injected into the inspected page: no `scripting` call, no Page agent request.
  - **Pure controller** `createFontPreviewController({ store, fonts })`: states `idle | loading | loaded | error(unavailable | unsupported)` for "Police téléchargée"; the three system stacks are always available.
    - `close()` releases the registered font.
    - A late `register` result after close is released at once and never shown (scenario 9).
- **CSP:** unchanged in both browsers. `scripts/manifest.test.mjs` asserts that the policy has no `img-src`, `default-src`, `media-src`, `font-src` or `connect-src`, so a future CSP change cannot silently break the previews or the panel-side re-download.
- **Privacy:**
  - Playing a medium downloads it from the panel, outside the measured requests of the inspected tab. The HTTP cache serves it when possible.
  - A font or image preview may re-download the file, like the comparison.
  - Nothing is sent to a third party. The README "Vie privée" section says so.

## Consequences

- Media requests made by the panel are not in the inspected tab's DevTools network log, so they never change the measured requests (as in 010).
- `canPlayType` is a hint. A container the browser accepts but whose codec it cannot decode reaches `unsupported` through `MediaError` code 3 or 4.
- The font sample may show fallback glyphs for subset or icon fonts. This is out of scope (US-018 §3).
