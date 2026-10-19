/**
 * WebAssembly implementation of `Codecs` on top of the @jsquash packages (ARCH-DECISION-008).
 *
 * The single-thread glue is imported directly, never the packages' `index.js`/`encode.js`, which
 * pull the multi-thread and SIMD variants (they need cross-origin isolation, unavailable in an
 * extension panel). Every codec is initialised lazily, once, on first use; a failed load is retried.
 */
import mozjpegDec from "@jsquash/jpeg/codec/dec/mozjpeg_dec.js";
import mozjpegEnc from "@jsquash/jpeg/codec/enc/mozjpeg_enc.js";
import { defaultOptions as jpegDefaults } from "@jsquash/jpeg/meta.js";
import initPng, { decode as pngDecode } from "@jsquash/png/codec/pkg/squoosh_png.js";
import initOxipng, { optimise_raw as oxipngOptimiseRaw } from "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js";
import webpDec from "@jsquash/webp/codec/dec/webp_dec.js";
import webpEnc from "@jsquash/webp/codec/enc/webp_enc.js";
import { defaultOptions as webpDefaults } from "@jsquash/webp/meta.js";
import avifDec from "@jsquash/avif/codec/dec/avif_dec.js";
import avifEnc from "@jsquash/avif/codec/enc/avif_enc.js";
import { defaultOptions as avifDefaults } from "@jsquash/avif/meta.js";
import initResize, { resize as wasmResize } from "@jsquash/resize/lib/resize/pkg/squoosh_resize.js";
import { EncodingSpec } from "../../domain/models/image-estimation";
import { Codecs, RawImage } from "./codecs";

export type CodecWasm =
  | "jpeg-dec"
  | "jpeg-enc"
  | "png-dec"
  | "oxipng"
  | "webp-dec"
  | "webp-enc"
  | "avif-dec"
  | "avif-enc"
  | "resize";

/** Resize method index of @jsquash/resize: triangle, catrom, mitchell, lanczos3. */
const LANCZOS3 = 3;

/** Minimal shape shared by the Emscripten modules we use. */
type EmscriptenFactory<T> = (options: {
  noInitialRun: boolean;
  instantiateWasm: (imports: WebAssembly.Imports, callback: (instance: WebAssembly.Instance) => void) => unknown;
}) => Promise<T>;

interface EmscriptenCodecs {
  jpegDec: { decode(data: Uint8Array, preserveOrientation: boolean): RawImage | null };
  jpegEnc: { encode(data: Uint8ClampedArray, width: number, height: number, options: object): Uint8Array };
  webpDec: { decode(data: Uint8Array): RawImage | null };
  webpEnc: { encode(data: Uint8ClampedArray, width: number, height: number, options: object): Uint8Array | null };
  avifDec: { decode(data: Uint8Array, bitDepth: number): RawImage | null };
  avifEnc: { encode(data: Uint8Array, width: number, height: number, options: object): Uint8Array | null };
}

export function createJsquashCodecs(loadWasm: (name: CodecWasm) => Promise<WebAssembly.Module>): Codecs {
  /** Memoises an initialisation; a rejection is forgotten so that the next call retries. */
  const lazy = <T>(init: () => Promise<T>): (() => Promise<T>) => {
    let pending: Promise<T> | undefined;
    return () => {
      if (!pending) {
        pending = init().catch((error: unknown) => {
          pending = undefined;
          throw error;
        });
      }
      return pending;
    };
  };

  const emscripten = <K extends keyof EmscriptenCodecs>(name: CodecWasm, factory: unknown) =>
    lazy<EmscriptenCodecs[K]>(async () => {
      const module = await loadWasm(name);
      return (factory as EmscriptenFactory<EmscriptenCodecs[K]>)({
        noInitialRun: true,
        instantiateWasm: (imports, callback) => {
          const instance = new WebAssembly.Instance(module, imports);
          callback(instance);
          return instance.exports;
        },
      });
    });

  const jpegDecoder = emscripten<"jpegDec">("jpeg-dec", mozjpegDec);
  const jpegEncoder = emscripten<"jpegEnc">("jpeg-enc", mozjpegEnc);
  const webpDecoder = emscripten<"webpDec">("webp-dec", webpDec);
  const webpEncoder = emscripten<"webpEnc">("webp-enc", webpEnc);
  const avifDecoder = emscripten<"avifDec">("avif-dec", avifDec);
  const avifEncoder = emscripten<"avifEnc">("avif-enc", avifEnc);
  const png = lazy(async () => initPng(await loadWasm("png-dec")));
  const oxipng = lazy(async () => initOxipng(await loadWasm("oxipng")));
  const resizer = lazy(async () => initResize(await loadWasm("resize")));

  const toRaw = (image: RawImage | null, what: string): RawImage => {
    if (!image) throw new Error(`${what} decoding error`);
    return { data: image.data, width: image.width, height: image.height };
  };
  /** Pixel buffer as bytes, honouring the view's offset (wasm glue expects a plain Uint8Array). */
  const bytesOf = (data: Uint8ClampedArray) => new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  /** Copy out of the wasm heap: the view may be invalidated by the next call. */
  const own = (data: Uint8Array | null, what: string): Uint8Array => {
    if (!data) throw new Error(`${what} encoding error`);
    return new Uint8Array(data);
  };

  return {
    async decode(format, bytes) {
      switch (format) {
        case "jpeg":
          return toRaw((await jpegDecoder()).decode(bytes, false), "JPEG");
        case "png":
          await png();
          return toRaw(pngDecode(bytes) as unknown as RawImage, "PNG");
        case "webp":
          return toRaw((await webpDecoder()).decode(bytes), "WebP");
        case "avif":
          return toRaw((await avifDecoder()).decode(bytes, 8), "AVIF");
      }
    },

    async resize(image, width, height) {
      await resizer();
      const result = wasmResize(bytesOf(image.data), image.width, image.height, width, height, LANCZOS3, true, false);
      return { data: new Uint8ClampedArray(result), width, height };
    },

    async encode(image, spec: EncodingSpec) {
      switch (spec.format) {
        case "jpeg": {
          const encoder = await jpegEncoder();
          return own(encoder.encode(image.data, image.width, image.height, { ...jpegDefaults, quality: spec.quality }), "JPEG");
        }
        case "png": {
          await oxipng();
          return own(oxipngOptimiseRaw(image.data, image.width, image.height, spec.level, false, false), "PNG");
        }
        case "webp": {
          const encoder = await webpEncoder();
          const options = spec.lossless
            ? { ...webpDefaults, lossless: 1, method: 4 }
            : { ...webpDefaults, quality: spec.quality, method: 4 };
          return own(encoder.encode(image.data, image.width, image.height, options), "WebP");
        }
        case "avif": {
          const encoder = await avifEncoder();
          const options = { ...avifDefaults, quality: spec.quality, speed: spec.speed, subsample: 1, bitDepth: 8 };
          return own(encoder.encode(bytesOf(image.data), image.width, image.height, options), "AVIF");
        }
      }
    },
  };
}
