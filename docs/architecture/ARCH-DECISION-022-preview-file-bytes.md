# ARCH-DECISION-022: Preview bytes come from a panel-side loader that accepts any format; the browser decodes the image; files share the session cache

- **Status:** Accepted (EPIC-PV, US-015, US-018)
- **Builds on:** [ARCH-DECISION-010](ARCH-DECISION-010-image-bytes-and-csp.md) (bytes source), [014](ARCH-DECISION-014-session-variant-cache.md) (session cache)

## Context

US-015 previews every image format the browser can display: JPEG, PNG, WebP, AVIF, GIF (animated GIFs play), SVG, BMP and ICO. It shows the resolution "read from the file", the format detected from the bytes, and the weight. It refuses files over 25 MB without decoding them. US-018 needs the bytes of a font.

The existing path cannot serve these:

- the comparison reads originals through the codec worker's `inspect`, which accepts only the formats the WASM codecs re-encode (JPEG, PNG, WebP, AVIF) and caps them at 10 MB (`MAX_IMAGE_BYTES`, an estimation cap);
- `image-bytes-source.ts` rejects DevTools content that is not base64. But Chrome reports SVG content as text.

Options considered:

1. **Extend the worker's `inspect` to every format.** Rejected:
   - the worker cannot decode GIF, SVG, BMP or ICO;
   - the preview does not need decoded pixels, because `<img>` decodes them;
   - it would widen a pipeline whose caps protect the estimation.
2. **Decode in the panel to read the size** (`createImageBitmap`). Rejected as the primary source:
   - it decodes before display, against scenario 9 ("nothing is decoded" over the cap);
   - it gives no animation flag;
   - SVG without intrinsic size has no meaningful bitmap size.
3. **A panel-side loader with header parsing; the browser decodes for display (chosen).**

## Decision

- **Port** (`domain/models/file-preview.ts`): `PreviewFileLoader { loadImage(url, declaredType); loadFont(url, declaredType) }`. It never rejects and returns `PreviewFileResult<PreviewImageInfo | PreviewFontInfo>`. Errors are `unavailable` and `too-large`.
- **Adapter** (`infra/file-preview/preview-file-loader.ts`, `createPreviewFileLoader({ getDevtoolsContent, fetch, maxBytes })`):
  1. **DevTools content first** (`ExtensionBrowser.getResourceContent`):
     - With `encoding: "base64"`, the decoded length is computed from the string length first: over `maxBytes`, it returns `too-large` without decoding. Otherwise it decodes.
     - With no encoding, the content is decoded as base64 only if the whole string is base64 and the decoded head has a known image or font signature (Firefox).
     - Otherwise the content is text. An image accepts it as UTF-8 bytes only when it sniffs as SVG (Chrome reports SVG as text). A font never accepts text.
     - Anything else falls through to step 2.
  2. **Else a re-download from the panel**: `fetch(url, { cache: "force-cache", credentials: "include" })`, exactly as in 010.
     - A non-2xx status, or a network error, gives `unavailable`.
     - A `Content-Length` over `maxBytes` gives `too-large`; the body is cancelled, unread.
     - Otherwise the body is read as a stream and aborted past `maxBytes` (`too-large`).
- **Image info** (`infra/file-preview/preview-image-info.ts`, pure, header only):
  - **Format:** from the signature (`sniffImageFormat`), else the MIME type (`MIME_FORMATS`), else "unknown". Bytes that are neither a known signature nor declared `image/*` give `unavailable` ("not an image").
  - **Size:** the existing `readDimensions` for JPEG, PNG, WebP and AVIF. New readers cover the GIF logical screen, the BMP `BITMAPINFOHEADER` (absolute height), the largest ICO directory entry (0 means 256), and the SVG root: `width`/`height` attributes that are plain numbers or `px` give the size, and anything else gives `vector` with no size.
  - **Animated:** a GIF with more than one image descriptor.
  - **MIME type for the `Blob`:** from the detected format (`image/svg+xml` for SVG, so `<img>` renders it), else the response type.
  - When a raster size cannot be read, the UI uses the decoded `naturalWidth`/`naturalHeight` after display, but never for a vector image.
- **Font info** (`infra/file-preview/font-format.ts`, pure):
  - signatures `wOF2`, `wOFF`, `OTTO`, `00 01 00 00` or `true` (TTF), and the EOT magic `0x504C` at offset 34;
  - else the MIME type, else the URL extension.
- **Display:** the UI builds a `Blob` and an object URL, then `<img src="blob:…">`. Every displayable format works, animated GIFs play, and an SVG in `<img>` never runs scripts (US-015 security NFR). A decode failure (`error` event) gives "Ce format d'image ne peut pas être affiché.".
- **Cap:** `MAX_PREVIEW_BYTES = 25_000_000` (`domain/file-preview/policy.ts`, PO default).
- **Session cache:**
  - `createSessionFileCache()` (`domain/image-comparison/session-file-cache.ts`) is the one 50 MB LRU of the panel session.
  - `createImageVariantStore(generator, { cache })` and `createPreviewFileStore(loader, { cache })` share it. Keys are prefixed `original:`, `variant:`, `preview-image:` and `preview-font:`.
  - The preview store has the variant store's semantics (014): shared in-flight loads that complete after close, peek for an instant reopening (scenario 10), and errors never cached ("Réessayer" retries for real).
- **Main thread:** base64 decoding of DevTools content runs on the panel thread (`decodeBase64`). The loading state is displayed first, and 25 MB is the worst case. Moving it off-thread stays possible behind the port.
- **`npm run dev`:** `FakePreviewFileLoader` (`infra/file-preview/fake-preview-file-loader.ts`) returns synthetic SVG images, and `unavailable` for fonts. `getPreviewFileLoader()` (`browser-factory.ts`) picks the adapter, with the same `ExtensionBrowser` instance as `getBrowser()`.

## Consequences

- The same JPEG may be cached twice, once as a comparison original and once as a preview image. Both count towards the one 50 MB cap.
- Fonts and images loaded before the recording started are re-downloaded from the HTTP cache when possible, as in 010. The README privacy section already says so; it now names fonts too.
