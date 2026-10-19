# ARCH-DECISION-010: Image bytes come from DevTools, else a panel-side re-fetch; manifest CSP allows WebAssembly

- **Status:** Accepted (US-001 to US-003)

## Context

The estimator needs the original file of each image. US-001 flags two constraints:

- DevTools `request.getContent()` only covers requests seen while DevTools is recording;
- any re-fetch **must not** appear in the page's measured requests, DOM profile or EcoIndex.

The story suggested a re-fetch by the background Page agent.

## Decision

### Source of bytes (`src/app/infra/image-estimator/image-bytes-source.ts`)

1. **DevTools content first.** `ExtensionBrowser` remembers, per normalised URL, the last HAR entry exposing `getContent()` (from `onRequestFinished`, and from `getHAR()` entries on Chrome), in a bounded map (most recent 1 000 URLs). `ExtensionBrowser.getResourceContent(url)` returns `{ content, encoding }` or `null`. It supports the Chrome callback form `(content, encoding)` and the Firefox promise form `[content, mimeType]`. The content is passed as `{ kind: "base64" }` and decoded in the worker; a string that is not valid base64 or does not start with a known image signature is rejected there and the bytes source falls back to step 2.
2. **Else a re-fetch from the panel itself**: `fetch(url, { cache: "force-cache", credentials: "include" })`. Responses over `MAX_IMAGE_BYTES` (by `Content-Length`, else by the received length) are rejected as `too-large`; network errors and non-2xx statuses give `failed(bytes-unavailable)`.

**Why the panel and not the Page agent:**

- Everything crossing the runtime port is JSON (ARCH-DECISION-002): a 10 MB image would cross it as a 13 MB base64 string and wake the Chrome service worker.
- The panel is an extension page with the `<all_urls>` host permission, so it is not subject to CORS, like the Page agent.
- **No measurement bias**: DevTools `onRequestFinished`/`getHAR` only report the inspected tab's requests, never the extension's own; the panel's request is not in the page, so it cannot change the DOM profile; and both browsers partition the HTTP cache by top-level site, so the extension's request does not warm the page's cache.
- No content script and no page-world code is involved.

### Manifest CSP (`src/manifest/base.json`)

- `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }` in the base manifest, so both targets get it (ARCH-DECISION-005). Workers created by extension pages inherit it.
- Chrome supports `'wasm-unsafe-eval'` from version 103: `minimum_chrome_version` moves from 102 to **103**. Firefox supports it in MV3 from 102; the existing minimum (109) is enough.
- `scripts/manifest.test.mjs` asserts the CSP on both merged manifests.

## Consequences

- Images loaded before recording started (no `refreshOnStart`) are still estimated, through the re-fetch.
- Images that need cookies the extension cannot send (e.g. third-party cookie blocking) end as `failed(bytes-unavailable)`, displayed as "non évaluée".
- To verify manually on both browsers: the re-fetch is absent from the DevTools Network panel of the inspected tab, and the request count of the analysed page does not change.
