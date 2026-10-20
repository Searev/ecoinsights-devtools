/**
 * Codec Web Worker entry (ARCH-DECISION-009). Wiring only: each WASM file becomes a separate asset
 * through Vite's `?url`, is fetched and compiled on first use, and requests go to the pipeline.
 * Imported by the browser factory as "./image-codec/codec.worker?worker".
 */
import jpegDecUrl from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url";
import jpegEncUrl from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url";
import pngDecUrl from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm?url";
import oxipngUrl from "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url";
import webpDecUrl from "@jsquash/webp/codec/dec/webp_dec.wasm?url";
import webpEncUrl from "@jsquash/webp/codec/enc/webp_enc.wasm?url";
import avifDecUrl from "@jsquash/avif/codec/dec/avif_dec.wasm?url";
import avifEncUrl from "@jsquash/avif/codec/enc/avif_enc.wasm?url";
import resizeUrl from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url";
import { CodecWasm, createJsquashCodecs } from "./jsquash-codecs";
import { createImagePipeline, FileResult } from "./pipeline";
import { CodecRequest, CodecResponse } from "./worker-protocol";

const WASM_URLS: Record<CodecWasm, string> = {
  "jpeg-dec": jpegDecUrl,
  "jpeg-enc": jpegEncUrl,
  "png-dec": pngDecUrl,
  oxipng: oxipngUrl,
  "webp-dec": webpDecUrl,
  "webp-enc": webpEncUrl,
  "avif-dec": avifDecUrl,
  "avif-enc": avifEncUrl,
  resize: resizeUrl,
};

const loadWasm = (name: CodecWasm) =>
  fetch(WASM_URLS[name])
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.compile(bytes));

const pipeline = createImagePipeline(createJsquashCodecs(loadWasm));

/** The buffer to transfer: the exact bytes, sliced when they are a view on a larger buffer. */
function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

async function answerFile(id: number, run: () => Promise<FileResult>) {
  const result = await run();
  if (!result.ok) {
    self.postMessage({ type: "file", id, result } satisfies CodecResponse);
    return;
  }
  const bytes = exactBuffer(result.bytes);
  const response: CodecResponse = { type: "file", id, result: { ok: true, bytes, info: result.info } };
  self.postMessage(response, { transfer: [bytes] });
}

self.onmessage = async (event: MessageEvent<CodecRequest>) => {
  const request = event.data;
  switch (request.type) {
    case "estimate": {
      const outcome = await pipeline.estimate({ job: request.job, source: request.source });
      self.postMessage({ type: "result", id: request.id, outcome } satisfies CodecResponse);
      return;
    }
    case "inspect":
      return answerFile(request.id, () =>
        pipeline.inspect({ declaredType: request.declaredType, source: request.source }),
      );
    case "generate":
      return answerFile(request.id, () => pipeline.generate({ job: request.job, source: request.source }));
  }
};
