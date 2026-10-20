# EcoInsights Profiler: architecture

> Target architecture introduced by the REFACTOR-001 plan ([TECH-REFACTOR-001-plan.md](TECH-REFACTOR-001-plan.md)), following [the architecture review](../review/ARCHITECTURE-REVIEW.md).
> Decisions and their reasons: `ARCH-DECISION-*.md` in this folder.

## 1. Runtime contexts

A WebExtension runs code in four isolated contexts. EcoInsights uses all four, **identically on Chrome and Firefox**.

| Context | Entry point | Built by | Role |
|---|---|---|---|
| DevTools page | `src/devtools.html` → `src/devtools/index.ts` | Vite | Registers the "EcoInsights" panel. |
| Panel (DevTools app) | `src/index.html` → `src/app/index.tsx` | Vite | SolidJS UI, domain logic, `ExtensionBrowser` adapter. Has `chrome.devtools.*` and `runtime.connect` only. |
| Background (Page agent) | `src/background/index.ts` → `scripts/background.js` | esbuild | Executes in the inspected tab on behalf of the panel: `scripting`, `tabs`, `permissions`, `browsingData`. Chrome: service worker. Firefox: event page. |
| Content script (Probe) | `src/content/probe.ts` → `scripts/probe.js` | esbuild | Injected on demand by the Page agent; reports link clicks and form submissions. |

```mermaid
flowchart LR
  subgraph Panel["Panel (DevTools app)"]
    UI[ui/*] --> UC[domain/use-case<br/>analyse-web-flow]
    UC --> ENG[domain/best-practices<br/>engine + RULES]
    UC --> B{{Browser interface}}
    UI -->|useBrowser| B
    B --> EB[infra/ExtensionBrowser]
    B --> MB[infra/MockBrowser]
    UC --> Q[domain/image-estimation<br/>estimation queue]
    Q --> IE{{ImageEstimator port}}
    IE --> WIE[infra/WorkerImageEstimator]
    WIE --> BYTES[infra/image-bytes-source]
    BYTES -->|getResourceContent| EB
    BYTES -->|"fetch(force-cache)"| WEB[(HTTP cache / network)]
    WIE -->|postMessage| WK[["infra/image-codec<br/>codec.worker (WASM)"]]
    UI -->|useAppDialog| DLG[ui/analysis/dialog<br/>one dialog host]
    DLG --> CMP[ui/analysis/comparison<br/>body + controller]
    DLG --> PRV[ui/analysis/preview<br/>image, media, iframe, font bodies]
    CMP --> VS[domain/image-comparison<br/>variant store, session LRU]
    PRV --> PS[domain/file-preview<br/>preview store, same LRU]
    PS -->|PreviewFileLoader| PFL[infra/file-preview<br/>loader, header parsers]
    PFL -->|getResourceContent| EB
    PFL -->|"fetch(force-cache)"| WEB
    VS -->|ImageVariantGenerator| WIE
    EB --> HAR[infra/har.ts]
    EB -->|chrome.devtools.network| NET[(DevTools network)]
  end
  EB <-->|"runtime.Port 'ecoinsights-page-agent'<br/>shared/protocol.ts"| AG[background/page-agent]
  AG -->|scripting.executeScript| PAGE[(Inspected tab)]
  AG -->|"inject scripts/probe.js"| PROBE[content/probe]
  PROBE -->|"runtime.sendMessage (ProbeMessage)"| AG
  AG -.->|imports RULES collectors| ENG
```

## 2. Layers inside the panel

```
ui/  ──►  domain/  ◄──  infra/
           ▲  models/       (Browser and ImageEstimator ports, NetworkRequest, BestPractice, image-estimation…)
           │  use-case/     (analyse-web-flow, ecoindex, export-csv)
           │  best-practices/ (rule.ts, engine.ts, index.ts, rules/*.rule.ts)
           │  image-estimation/ (policy, estimation-queue, image-gain, image-requests, signature)
           │  image-comparison/ (comparison-subject, variant-store, lru-byte-cache)
           │  work-queue/ (generic keyed FIFO queue, ARCH-DECISION-018)
           │  text-content/ (minification scanner, content queue, policy)
           │  file-preview/ (preview subjects, preview file store, policy; EPIC-PV)
```

- `domain/` never references `chrome`/`browser` and never imports `infra/` or `ui/`. ESLint enforces this.
- `infra/` implements `domain/models/browser.ts`. `browser-factory.ts` picks `ExtensionBrowser` when `chrome.devtools` exists, `MockBrowser` otherwise (`npm run dev`).
- `ui/` gets the `Browser` from a Solid context (`useBrowser()`) and passes it to use cases. Only `src/app/index.tsx` imports the factory.
- The `ImageEstimator` port (`domain/models/image-estimator.ts`) follows the same pattern: `getImageEstimator()` returns a `WorkerImageEstimator` in the extension and a `FakeImageEstimator` otherwise (`npm run dev` loads no WASM). The UI gets it with `useImageEstimator()` and passes it to `analyseWebFlow` as `options.imageEstimator`.

## 3. Key flows

### 3.1 Request / response

1. `ExtensionBrowser` sends `{type:"request", id, tabId, method, params}` and starts a timeout (5 s, or 30 s for `page.reload`).
2. The Page agent dispatches to `handlers[method]` and replies `{type:"response", id, ok, result | error}`.
3. On timeout or port disconnect, the promise rejects with `AgentError` (`TIMEOUT` / `DISCONNECTED`). If the port dropped (Chrome service-worker restart), `ExtensionBrowser` reconnects on the next call and re-sends `navigation.watch` if listeners are still registered.

### 3.2 Recording a web flow (`analyse-web-flow`)

- **DOM profile:** the use case calls `browser.getPageInfo()` every second; there is no timer in adapters.
- **Requests:** `browser.onNetworkRequest`.
- **Page boundaries:** `browser.onNavigation`.
  - `url-changed` closes the page if the path or query changed.
  - `link-clicked` and `form-submitted` close it only when the matching option is enabled.
- **Best practices:**
  1. The use case calls `browser.collectPageData(ruleIds)` on its own cadence: at start, then when the DOM changes significantly (throttled), and just before a page is closed by a navigation intent.
  2. On every update, for each page, it requests the rules' estimation jobs (`planEstimations`), then calls `evaluateRules(RULES, { url, requests, pageData, estimates })`, which is pure. See §3.4 for the estimates.

### 3.3 Best-practice rule

`domain/best-practices/rules/<name>.rule.ts` exports a `BestPracticeRule`:

- `collect()` is optional and self-contained. The Page agent executes it in the tab, one `executeScript` per rule, in parallel.
- `estimations(ctx)` is optional, pure and synchronous: the image transformations the rule needs (`EstimationJob`: URL + `resize` / `convert` / `resize-convert`).
- `evaluate(ctx)` is pure: it receives the collected page data, the normalised requests and `ctx.estimates`, a read-only lookup of the estimation cache. While an estimate is pending the rule returns no `compliance` and a `progress { done, total }`.

Registering a rule means adding one line in `domain/best-practices/index.ts`. No protocol, adapter or UI change is needed.

### 3.4 Image estimation (US-001 to US-003)

Decisions: [ARCH-DECISION-007](ARCH-DECISION-007-async-image-estimation.md) (async estimation), [008](ARCH-DECISION-008-wasm-image-codecs.md) (WASM codecs), [009](ARCH-DECISION-009-codec-web-worker.md) (Web Worker), [010](ARCH-DECISION-010-image-bytes-and-csp.md) (image bytes, CSP), [011](ARCH-DECISION-011-image-gain-model.md) (gain model).

1. **Estimation queue** (`domain/image-estimation/estimation-queue.ts`): one per analysis, created by `analyse-web-flow` when best practices are checked.
   - It caches by `estimationKey` (URL + transformation), so one image is encoded once per transformation for the whole journey.
   - It runs one job at a time.
   - `onChange` fires once per settled job, and the use case then re-sends the analyses. Closed pages are rebuilt (best practices and `imageGain` only) when the queue changed.
   - `stop()` turns every pending job into `skipped(analysis-stopped)` and calls `estimator.cancel()`. `stopAnalysis()` returns the final pages.
2. **Combined gain** (`domain/image-estimation/image-gain.ts`): once both image rules have settled for an image they both flag, a `resize-convert` job is requested (`planCombinedEstimations`). `computePageImageGain` gives `PageAnalysis.imageGain` (bytes, pending, not evaluated, fallback), without double counting, and only for images the page transferred.
3. **`WorkerImageEstimator`** (`infra/image-estimator/`):
   - It gets the original bytes from `image-bytes-source.ts`: first the DevTools content of the request (`ExtensionBrowser.getResourceContent`); otherwise a panel-side `fetch(url, { cache: "force-cache" })`, which is not part of the inspected tab's measured requests.
   - It posts them to the codec worker.
   - It never rejects: on a timeout, a worker error or a cancel, it terminates the worker and resolves `failed` or `skipped`.
4. **Codec worker** (`infra/image-codec/`): a classic IIFE worker.
   - It runs the single-thread `@jsquash/*` WASM codecs (mozjpeg, PNG + oxipng, WebP, AVIF, Lanczos3 resize), each compiled lazily from its own `.wasm` asset.
   - The `pipeline.ts` steps: detect the format from the bytes, skip animated, oversized and unsupported images, decode, resize and encode.
   - The encoding settings live in `domain/image-estimation/policy.ts`.

```mermaid
sequenceDiagram
  participant UC as analyse-web-flow
  participant Q as EstimationQueue
  participant E as WorkerImageEstimator
  participant W as codec.worker
  UC->>Q: request(planEstimations(...))
  UC->>UC: evaluateRules(..., estimates = queue.lookup) → "Estimation en cours…"
  Q->>E: estimate(job) (one at a time)
  E->>E: bytes: DevTools content, else fetch(force-cache)
  E->>W: CodecRequest
  W-->>E: CodecResponse(outcome)
  E-->>Q: outcome
  Q-->>UC: onChange → re-evaluate all pages → consume()
```

### 3.5 Image names and comparison dialog (US-004, US-005)

Decisions: [ARCH-DECISION-012](ARCH-DECISION-012-on-demand-variant-generation.md) (on-demand variants), [013](ARCH-DECISION-013-comparison-subject-from-findings.md) (comparison subject, finding fields), [014](ARCH-DECISION-014-session-variant-cache.md) (session cache), [015](ARCH-DECISION-015-image-lines-from-findings.md) (image lines), [016](ARCH-DECISION-016-comparison-dialog-host.md) (dialog host, CSP `blob:`).

1. **Image lines** (`ui/analysis/best-practices-view.ts`): each persisted line of an image rule is paired with its finding through `lineFindings` (same order as the rule's lines, each starting with `fileLabel : `). The name is shortened by `displayImageName` (`ui/analysis/image-name.ts`); lines that cannot be paired (legacy analyses, other rules) stay plain text.
2. **Comparison subject** (`domain/image-comparison/comparison-subject.ts`): for an offender line, `comparisonSubjectFor(page.bestPractices, ruleId, url)` gives the versions to toggle (Originale, Redimensionnée, AVIF / WebP sans perte, Les deux) with their `EstimationJob`s, plus the natural size, display box and recorded weight from the findings (`ImageFinding.natural`, `display`, `sourceBytes`). The format rule has a page collector only for the display boxes.
3. **Variant store** (`domain/image-comparison/variant-store.ts`): one per panel session, created in `index.tsx`. It caches originals and variants in a 50 MB LRU, shares in-flight work (which completes after the dialog closed) and never caches errors.
4. **Generation:** `WorkerImageEstimator` also implements the `ImageVariantGenerator` port. `loadOriginal` uses the same bytes source as the estimation and sends an `inspect` request; `generate` sends a `generate` request with a copy of the original. The worker runs `createImagePipeline(codecs)`: `estimate`, `inspect` and `generate` share one core, so a generated size equals the estimate.
5. **Dialog** (`ui/analysis/comparison/`): since EPIC-PV, the comparison is one body (`ComparisonBody`) of the app dialog host (§3.7, ARCH-DECISION-021); `createComparisonController` (pure) holds the per-version `idle | loading | loaded | error` states, the selected version and the display mode, ignores late results after close, and creates/revokes the object URLs.

```mermaid
sequenceDiagram
  participant L as Image name button
  participant C as Comparison controller
  participant S as Variant store
  participant E as WorkerImageEstimator
  participant W as codec.worker
  L->>C: open(subject)
  C->>S: original(url) (peek first)
  S->>E: loadOriginal (DevTools content, else fetch force-cache)
  E->>W: inspect
  W-->>E: bytes + info
  C->>S: variant(job) on selection
  S->>E: generate(job, copy of original)
  E->>W: generate
  W-->>E: encoded bytes + info
  S-->>C: loaded → object URL → <img>
```

### 3.6 BP2 rules and text content analysis (US-006 to US-014)

Decisions: [ARCH-DECISION-017](ARCH-DECISION-017-line-refs-for-file-names.md) (line references), [018](ARCH-DECISION-018-text-content-analysis.md) (text content analysis), [019](ARCH-DECISION-019-request-model-protocol-and-start-time.md) (`httpVersion`, `startedAt`).

1. **Rules:** nine more `BestPracticeRule`s in `RULES`.
   - Three have collectors: alternatives, lazy loading, autoplay.
   - Five read only the requests: compression, cache headers, domains, HTTP/2, GIF.
   - Shared helpers: `rules/request-helpers.ts`, and `rules/rule-lines.ts` (`fileLine`, `capLines`: 20 lines + "… et N autres").
2. **Line references:** lines naming a file carry `BestPractice.lineRefs[i] = { url, prefix? }`. `best-practices-view.ts` renders them as `prefix + <ImageName> + rest`, and falls back to text on any mismatch.
3. **Minification (US-010):**
   - The rule declares `contentAnalyses()` jobs. `analyse-web-flow` queues them in a second `WorkQueue` (`domain/work-queue/`, also behind `EstimationQueue`), keyed by URL, concurrency 1.
   - The `ContentAnalyser` port (`infra/content-analyser/devtools-content-analyser.ts`) reads `ExtensionBrowser.getResourceContent` only, with no `fetch`. It decodes base64 or text with the response charset and feeds the pure streaming scanner (`domain/text-content/minification.ts`) in 256 Ki slices, yielding between slices.
   - `evaluate` reads `ctx.contents` and shows "Analyse en cours… (n/N fichiers)" (`progress.unit = "files"`) while files are pending.
   - Stop settles pending files as `analysis-stopped`.

### 3.7 Previews of the flagged elements (US-015 to US-018)

Decisions: [ARCH-DECISION-020](ARCH-DECISION-020-preview-subjects-from-line-refs.md) (preview subjects from line references), [021](ARCH-DECISION-021-app-dialog-host.md) (app dialog host), [022](ARCH-DECISION-022-preview-file-bytes.md) (preview bytes, session cache), [023](ARCH-DECISION-023-media-and-font-previews-csp.md) (media, fonts, CSP).

1. **What a line previews.**
   - Rules set `LineRef.preview` (`image` / `video` / `audio` / `iframe` / `font`) through `fileLine(url, rest, prefix, preview)`, with the element's CSS box (`display`) or the iframe position (`top`).
   - US-006, US-007 and US-014 read the box with their existing collectors (one `getBoundingClientRect` per element). US-013 has a collector for the largest `<img>` box per URL.
   - Refs saved before the epic fall back to the rule and prefix (`legacyLinePreview`). Unprefixed US-006 lines stay plain, because they are ambiguous with `<area>`.
2. **Subject.**
   - `best-practices-view.ts` builds one `createPreviewSubjectResolver(page.requests)` per page, lazily. It turns each file line's ref into a `PreviewSubject`, or undefined for non-`http(s)` URLs and unknown kinds.
   - The subject carries the recorded MIME type, the media bytes downloaded by the page (sum over its requests, `206` included), the last status, and the iframe document weight.
3. **Dialog host** (`ui/analysis/dialog/`).
   - `AppDialogProvider` (mounted once in `index.tsx`) owns the single `<dialog>`, the header (short name, full URL), "Fermer", Escape, the backdrop and focus return (`data-dialog-key`).
   - The pure `createDialogHost` refuses a second opening. A body is mounted per opening, after `showModal()`, and unmounted on close.
   - `ImageName` opens a comparison (image rules) or a preview (file lines) through `useAppDialog()`.
4. **Bodies** (`ui/analysis/preview/`). Each has a pure controller with `idle | loading | loaded | error` states that ignores late results after close:
   - **image:** `PreviewFileStore`, then a `blob:` URL, then `<img>`; the browser decodes every format;
   - **media:** native `<video>` / `<audio>` with `preload="metadata"`, no autoplay, and `releaseMedia` on close;
   - **iframe:** data only, never an `<iframe>`;
   - **font:** `FontFace` from the bytes, in the panel's `document.fonts` only, released on close.
5. **Bytes** (`infra/file-preview/preview-file-loader.ts`).
   - DevTools content first (base64, Firefox base64 without encoding, SVG as text), else `fetch(url, { cache: "force-cache" })` from the panel.
   - Capped at 25 MB with a streamed read; nothing is decoded over the cap.
   - Pure header parsers give the format, the size (GIF, BMP, ICO, SVG root, and `readDimensions`), the GIF animation flag and the font format.
   - `PreviewFileStore` caches files in the session LRU it shares with the comparison (`createSessionFileCache`, 50 MB).

```mermaid
sequenceDiagram
  participant L as File name button
  participant H as Dialog host
  participant B as Preview body + controller
  participant S as Preview store (session LRU)
  participant F as Preview file loader
  L->>H: openPreview(subject)
  H->>H: showModal(), then mount body
  B->>S: peekImage / image(url)
  S->>F: loadImage (DevTools content, else fetch force-cache, ≤ 25 MB)
  F-->>S: bytes + info (header parsing)
  S-->>B: loaded → blob: URL → <img>
  H->>B: close → unmount → revoke URL / release font / stop media
```

## 4. Build

`npm run build` → `dist/chrome/` and `dist/firefox/` (+ zips). The manifest is generated from `src/manifest/base.json` plus a per-target overlay. Only the `background` key, Chrome's `minimum_chrome_version` (103) and Firefox's `browser_specific_settings` differ.

- **CSP:** both targets get `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` for extension pages, which is needed to compile WASM. This is why Chrome needs version 103 or later. It deliberately has no `img-src`, `default-src`, `media-src`, `font-src` or `connect-src`, so the dialogs can display `blob:` images, stream remote media, register fonts from bytes and re-download files; `scripts/manifest.test.mjs` asserts it (ARCH-DECISION-016, 023).
- **Codec worker:** Vite builds it as a classic IIFE (`worker.format: "iife"`) and emits each codec `.wasm` as a separate asset, about 5.9 MB per target. They are loaded only when an estimation needs them. `optimizeDeps.exclude` keeps the `@jsquash/*` packages out of the dev pre-bundle.
- **Type-checking:** `tsconfig.json` adds `@jsquash/jpeg/emscripten-types.d.ts` to `files`, because the glue files imported directly need its global `EmscriptenWasm` namespace (ARCH-DECISION-008).

## 5. Tests

Vitest (`npm test`) plus jsdom for page-side code. There are no Solid component tests: the comparison dialog's behaviour is tested through its pure controller and helpers. Every module is tested through its interface with injected fakes (fake `chrome` objects, `MockBrowser`, fake `ImageEstimator`, fake `WorkerLike`, fake codecs), not with module mocking. See [ARCH-DECISION-006](ARCH-DECISION-006-test-strategy.md).

The codec tests run the **real** WASM codecs under Node: `infra/image-codec/testing/node-wasm.ts` compiles the `.wasm` files from `node_modules`, and the test images are synthetic, generated in the tests.
