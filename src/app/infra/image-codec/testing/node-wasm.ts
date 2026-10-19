/** Test helper: loads the real codec WASM modules from node_modules (no binary fixtures in the repo). */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CodecWasm } from "../jsquash-codecs";

const WASM_FILES: Record<CodecWasm, string> = {
  "jpeg-dec": "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm",
  "jpeg-enc": "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm",
  "png-dec": "@jsquash/png/codec/pkg/squoosh_png_bg.wasm",
  oxipng: "@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm",
  "webp-dec": "@jsquash/webp/codec/dec/webp_dec.wasm",
  "webp-enc": "@jsquash/webp/codec/enc/webp_enc.wasm",
  "avif-dec": "@jsquash/avif/codec/dec/avif_dec.wasm",
  "avif-enc": "@jsquash/avif/codec/enc/avif_enc.wasm",
  resize: "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm",
};

const cache = new Map<CodecWasm, Promise<WebAssembly.Module>>();

export function loadWasmFromNodeModules(name: CodecWasm): Promise<WebAssembly.Module> {
  let module = cache.get(name);
  if (!module) {
    module = readFile(resolve(process.cwd(), "node_modules", WASM_FILES[name])).then((bytes) =>
      WebAssembly.compile(bytes),
    );
    cache.set(name, module);
  }
  return module;
}
