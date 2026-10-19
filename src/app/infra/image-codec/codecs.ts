/**
 * Codec port used by the estimation pipeline (ARCH-DECISION-008). Implemented with WebAssembly in
 * `jsquash-codecs.ts`; faked in tests that must count calls or force failures.
 */
import { EncodingSpec } from "../../domain/models/image-estimation";

/** Decoded pixels, RGBA 8 bits. Not the DOM `ImageData`, which does not exist in Node. */
export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Codecs {
  decode(format: "jpeg" | "png" | "webp" | "avif", bytes: Uint8Array): Promise<RawImage>;
  /** Lanczos3, premultiplied alpha, sRGB. */
  resize(image: RawImage, width: number, height: number): Promise<RawImage>;
  encode(image: RawImage, spec: EncodingSpec): Promise<Uint8Array>;
}
