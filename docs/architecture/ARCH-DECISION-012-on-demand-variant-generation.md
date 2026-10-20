# ARCH-DECISION-012: Optimised variants are generated on demand by the existing codec worker, through two new request types

- **Status:** Accepted (US-005)
- **Amends:** [ARCH-DECISION-009](ARCH-DECISION-009-codec-web-worker.md) (worker protocol)

## Context

US-005 shows an offending image next to its optimised version. Optimised bytes are not stored: the estimation (ARCH-DECISION-007) only keeps sizes. The dialog therefore needs to:

- obtain the **original** bytes, also for saved analyses (DevTools content, else re-fetch: ARCH-DECISION-010);
- produce the **encoded bytes** of one variant, with exactly the estimation settings, so that the size shown equals the estimated size (US-005 scenario 4);
- never slow down the estimation path, and never block the panel's main thread (NFR: no task over 50 ms).

Options considered:

1. **Return the encoded bytes with every estimation** and keep them. Rejected: the estimation encodes every image of a journey; keeping all variants would cost tens of MB nobody asked for, and transferring them would slow the estimation path (sobriety NFR: "generate only the selected variant").
2. **A second, dialog-only worker.** Rejected: it would compile the WASM codecs a second time (the AVIF encoder alone is 3.5 MB) and the story asks to reuse the existing worker.
3. **Two new request types on the same worker and the same pipeline (chosen).**

## Decision

- **Protocol** (`src/app/infra/image-codec/worker-protocol.ts`): `CodecRequest` becomes a union.
  - `estimate` is unchanged and still answers `{ type: "result", outcome }`, sizes only.
  - `inspect { declaredType, source }` decodes base64 if needed, detects the format (same `detectImageFormat` as the estimation), reads the pixel size (header, else decode), and answers `{ type: "file", result }` with the bytes **transferred back** and their `ImageFileInfo`.
  - `generate { job, source }` runs the **same steps as `estimate`** and answers `{ type: "file", result }` with the encoded bytes (transferred) and their `ImageFileInfo`.
- **One pipeline, three entry points** (`pipeline.ts`): `createImagePipeline(codecs)` returns `{ estimate, inspect, generate }`, sharing the format detection, caps, encoding choice and the one-entry decode cache. `createEstimationPipeline(codecs)` stays as `createImagePipeline(codecs).estimate`. `generate` is `estimate` that also returns the encoded `Uint8Array`, so the two cannot drift: same input bytes, same job → same size (the codecs are deterministic, see the US-002 determinism test).
- **Panel side:** `WorkerImageEstimator` also implements the new domain port `ImageVariantGenerator` (`domain/models/image-variants.ts`): `loadOriginal(url, declaredType)` (bytes source → `inspect`) and `generate(job, original)` (posts a **copy** of the cached original, transferred, so the cache keeps its bytes). Same worker instance, same lazy creation, same timeout (120 s) and recycling. Methods never reject: failures become `original-unavailable` or `generation-failed`.
- **Scheduling:** dialog requests are posted directly to the worker, not through the analysis `EstimationQueue`. The worker then holds at most one estimation and one dialog request. "Never delays the estimation queue beyond sharing the single worker" is met: the queue keeps its concurrency 1 and its order.
- **Analysis stop:** `cancel()` still terminates the worker. A dialog generation in flight at that moment resolves `generation-failed` ("Réessayer" works). Stopping requires closing the modal dialog first, so this only affects a generation that kept running after the dialog closed; its result is then simply not cached.
- **`npm run dev`:** `FakeImageEstimator` implements the port with small synthetic images, no worker, no WASM.

## Consequences

- The estimation path is byte-for-byte unchanged on the wire: `estimate` still posts and receives the same messages.
- A variant costs one encode in the worker (≈ 1.7 s for AVIF on a 2 MP synthetic image in Node), shown as "Génération de la version optimisée…".
- The worker transfers the encoded buffer; `encode` results that are views on a larger buffer are sliced first.
