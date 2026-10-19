# ARCH-DECISION-009: One lazily created, classic Web Worker in the DevTools panel runs the codecs

- **Status:** Accepted (US-001 to US-003)

## Context

- Decoding, resizing and encoding must never block the panel (US-001 NFR: no main-thread task over 50 ms caused by estimation).
- The panel is the only context where the work fits: the Chrome background is a service worker that can be stopped at any time, the Firefox background is an event page, and content scripts run in the audited page (they would bias its measurement).
- Firefox ≥ 109 is supported; module workers (`new Worker(url, { type: "module" })`) only exist from Firefox 114.

## Decision

- **One dedicated Web Worker, created by the panel on the first estimation**, never at panel load. Entry: `src/app/infra/image-codec/codec.worker.ts`, imported by the factory with Vite's `?worker` suffix.
- **Classic (IIFE) worker format** (`worker.format: "iife"` in `vite.config.ts`, Vite 4's default made explicit), identical on Chrome and Firefox. Verified by a spike: the bundle has no `import.meta` and no `eval`, and every `.wasm` is emitted as a separate asset fetched on demand.
- **Message protocol** in `src/app/infra/image-codec/worker-protocol.ts`: `CodecRequest { id, job, source }` → exactly one `CodecResponse { id, outcome }`. Binary sources are transferred, not copied; base64 sources (DevTools `getContent`) are decoded inside the worker.
- **The panel side is `WorkerImageEstimator`** (`src/app/infra/image-estimator/`), implementing the `ImageEstimator` port. It:
  - obtains the bytes (ARCH-DECISION-010), then posts one request;
  - applies a per-job timeout (120 s, constructor option). On timeout or worker `error`, it terminates the worker, settles the job as `failed(timeout | encode-failed)` and recreates a worker lazily for the next job;
  - receives the worker factory by injection (`createWorker: () => WorkerLike`), so it is tested with a fake worker.
- **Inside the worker**, a pure async pipeline (`pipeline.ts`) receives `Codecs` by injection: detect format (MIME first, else signature) → animation and caps checks → decode → resize → encode → outcome. It keeps the last decoded image (one entry) so the resize, convert and combined jobs of the same URL decode once.
- **The domain queue keeps concurrency at 1**, so the worker never has more than one job.

## Consequences

- The worker bundle contains the JS glue of every codec (tens of kB); the WASM binaries are fetched lazily per codec.
- MV3 needs `'wasm-unsafe-eval'` in the extension pages CSP for `WebAssembly.compile` (ARCH-DECISION-010 covers the manifest change).
- `npm run dev` with `MockBrowser` uses a fake estimator and never creates the worker or loads WASM (US-001 NFR).
