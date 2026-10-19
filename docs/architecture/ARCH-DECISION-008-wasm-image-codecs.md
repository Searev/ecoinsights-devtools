# ARCH-DECISION-008: WebAssembly image codecs: `@jsquash/*`, single-thread builds, explicit initialisation

- **Status:** Accepted (US-001 to US-003)

## Context

The product owner requires real encoding (no ratio estimates) with `sharp`-like settings. `sharp` is a native Node addon and cannot run in an extension. Requirements:

- decode JPEG, PNG, WebP, AVIF; resize with Lanczos3; encode mozjpeg, PNG (max compression), WebP (lossy and lossless), AVIF;
- **identical results on Chrome and Firefox for the same bytes** (US-002 NFR);
- run in a Web Worker of an MV3 extension page (no `eval`, no remote code, no `SharedArrayBuffer`: extension pages are not cross-origin isolated);
- run under Vitest (Node) so the pipeline is tested with real codecs.

## Decision

- **Codecs: the `@jsquash/*` packages** (the Squoosh codecs compiled to WebAssembly), pinned:

  | Package | Version | Used for | WASM |
  |---|---|---|---|
  | `@jsquash/jpeg` | 1.6.0 | mozjpeg decode + encode | 166 kB + 252 kB |
  | `@jsquash/png` | 3.1.1 | PNG decode | 181 kB |
  | `@jsquash/oxipng` | 2.3.0 | PNG encode from raw pixels (`optimise_raw`) | 164 kB |
  | `@jsquash/webp` | 1.5.0 | WebP decode + encode (lossy / lossless) | 138 kB + 281 kB |
  | `@jsquash/avif` | 2.1.1 | AVIF decode + encode | 1 171 kB + 3 486 kB |
  | `@jsquash/resize` | 2.1.1 | Lanczos3 resize | 35 kB |

- **Import the single-thread codec glue directly** (`@jsquash/avif/codec/enc/avif_enc.js`, `@jsquash/resize/lib/resize/pkg/squoosh_resize.js`, `@jsquash/oxipng/codec/pkg/squoosh_oxipng.js`, …), not the packages' `index.js`. The package entry points dynamically import multi-thread variants (`*_mt`, `pkg-parallel` with nested workers) and, for resize, the hqx and magic-kernel codecs. These cannot work without cross-origin isolation, would add assets, and would differ between browsers. The non-SIMD WebP encoder is used for the same reason (one code path everywhere).
- **Explicit initialisation with a compiled `WebAssembly.Module`**, supplied by an injected loader `loadWasm(name)`:
  - in the worker: `fetch(<asset url from a Vite "?url" import>)` → `WebAssembly.compile`, once per codec, on first use (lazy);
  - in Vitest: `readFileSync(node_modules/...wasm)` → `WebAssembly.compile`. Tests run the **real** codecs in the Node environment; the spike confirmed the glue runs under Node 24 with an injected module.
- **Decoding uses WASM too**, not `createImageBitmap`/`OffscreenCanvas`: browser decoders apply colour management and premultiplication differently on Chrome and Firefox, which would break the "identical results" requirement and could not be tested in Node.
- **Settings** (data in `src/app/domain/image-estimation/policy.ts`):

  | Case | Encoding | Reason |
  |---|---|---|
  | Resize, JPEG | mozjpeg quality 80 (other options: jsquash defaults, progressive + optimised Huffman) | PO: sharp quality 80 with mozjpeg |
  | Resize, PNG | oxipng level 2 from raw pixels | PO: "compression 9". The Squoosh PNG encoder does not compress (a 2 MB RGBA buffer → 808 kB; oxipng → 403 kB). oxipng level 2 is the closest available "maximum deflate" setting. |
  | Resize, WebP | lossless if the source is VP8L, else lossy quality 80 | "keep the source quality range": sharp's WebP default is 80 |
  | Resize, AVIF | quality 65, speed 6 | Owner decision D3 (2026-10-19): same quality as the US-002 AVIF target, rather than sharp's default 50, so a resize of an AVIF does not also lower its quality |
  | Convert, JPEG | AVIF quality 65, 4:2:0, 8 bits, **speed 6** | PO: `avif({ quality: 65 })`. See below for speed. |
  | Convert, PNG | WebP lossless, method 4 | PO: `webp({ lossless: true })`, sharp effort 4 = method 4 |
  | Resize filter | Lanczos3, premultiplied alpha, **sRGB (no linear light)** | sharp's default kernel; sharp resizes in sRGB |

- **AVIF speed 6, not sharp's effort 4 (≈ speed 5).** Measured in Node on a 2 MP photo (1632×1224, Apple M-series, single thread): speed 6 → **0.69 s**, speed 5 → **6.6 s**, for a similar size (17.6 kB vs 21.3 kB). Ten times the CPU for no size benefit contradicts the sobriety goal. This is a deviation from a literal sharp equivalence, recorded in the plan.

## Consequences

- About **5.9 MB of WASM** is added to each `dist/<target>` (the AVIF encoder alone is 3.5 MB). None of it is loaded until the first estimation of an analysis with best practices, and each codec only when an image of that format needs it.
- Static GIF, BMP, ICO and TIFF have no codec: they are skipped as `unsupported-format` (not listed, not counted). See the plan's deviations.
- Upgrading a codec can change estimated sizes; versions are pinned with a caret in `package.json` and locked in `package-lock.json`.
- **Type declarations of the direct glue imports.** The Emscripten glue declarations (`@jsquash/{jpeg,webp,avif}/codec/**/*.d.ts`) use a global `EmscriptenWasm` namespace that is declared only in each package's `emscripten-types.d.ts`, which the packages' entry points pull in but the glue files do not. Importing the glue directly therefore gave 12 `TS2503` errors. Fix (2026-10-19): `tsconfig.json` lists `node_modules/@jsquash/jpeg/emscripten-types.d.ts` in `files` (the three packages ship a byte-identical copy, one is enough) and makes the former implicit `include` explicit (`src`, `vite.config.ts`, `vitest.config.ts`; the set of compiled project files is unchanged).
  - Rejected: `skipLibCheck: true`. It would hide this error but also every other library type error, and the codec glue types (`ModuleFactory`, `instantiateWasm`) are what `jsquash-codecs.ts` relies on.
  - Rejected: a `/// <reference path="…/node_modules/…" />` in a project `.d.ts`. `@typescript-eslint/recommended` forbids `path` references (`triple-slash-reference`).
  - Rejected: copying the namespace into the project. It would drift from the package version.
  - If `@jsquash/jpeg` is ever removed, point `files` at another package's copy.
