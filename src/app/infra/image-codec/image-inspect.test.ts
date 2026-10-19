import { beforeAll, describe, expect, it } from "vitest";
import { Codecs } from "./codecs";
import { isAnimated, isLosslessWebp, readDimensions } from "./image-inspect";
import { createJsquashCodecs } from "./jsquash-codecs";
import { loadWasmFromNodeModules } from "./testing/node-wasm";
import { pngChunk, pngHeader, sampleFiles, webpContainer, webpVp8x, ascii } from "./testing/synthetic";

describe("image-inspect", () => {
  let codecs: Codecs;
  let files: Awaited<ReturnType<typeof sampleFiles>>;
  beforeAll(async () => {
    codecs = createJsquashCodecs(loadWasmFromNodeModules);
    files = await sampleFiles(codecs, 96, 64);
  });

  describe("readDimensions", () => {
    it("reads JPEG, PNG, WebP (lossy, lossless) and AVIF sizes from real files", () => {
      expect(readDimensions("jpeg", files.jpeg)).toEqual({ width: 96, height: 64 });
      expect(readDimensions("png", files.png)).toEqual({ width: 96, height: 64 });
      expect(readDimensions("webp", files.webpLossy)).toEqual({ width: 96, height: 64 });
      expect(readDimensions("webp", files.webpLossless)).toEqual({ width: 96, height: 64 });
      expect(readDimensions("avif", files.avif)).toEqual({ width: 96, height: 64 });
    });

    it("reads the canvas size of a VP8X WebP", () => {
      const webp = webpContainer([webpVp8x(0, 6000, 5000)]);
      expect(readDimensions("webp", webp)).toEqual({ width: 6000, height: 5000 });
    });

    it("reads a PNG header declaring a huge size without any pixel data", () => {
      expect(readDimensions("png", pngHeader(6000, 5000))).toEqual({ width: 6000, height: 5000 });
    });

    it("returns undefined for truncated or unrelated bytes", () => {
      expect(readDimensions("jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBeUndefined();
      expect(readDimensions("png", new Uint8Array([0x89, 0x50]))).toBeUndefined();
      expect(readDimensions("webp", new Uint8Array(ascii("RIFF....WEBP")))).toBeUndefined();
      expect(readDimensions("avif", new Uint8Array(40))).toBeUndefined();
    });
  });

  describe("isAnimated", () => {
    it("is false for the static real files", () => {
      expect(isAnimated("png", files.png)).toBe(false);
      expect(isAnimated("webp", files.webpLossy)).toBe(false);
      expect(isAnimated("webp", files.webpLossless)).toBe(false);
      expect(isAnimated("jpeg", files.jpeg)).toBe(false);
      expect(isAnimated("avif", files.avif)).toBe(false);
    });

    it("detects an APNG (acTL before IDAT) but not an acTL after IDAT", () => {
      expect(isAnimated("png", pngHeader(8, 8, [pngChunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0])]))).toBe(true);
      expect(
        isAnimated("png", pngHeader(8, 8, [pngChunk("IDAT", [0]), pngChunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0])])),
      ).toBe(false);
    });

    it("detects an animated WebP by the VP8X flag or an ANIM chunk", () => {
      expect(isAnimated("webp", webpContainer([webpVp8x(0x02, 8, 8)]))).toBe(true);
      expect(isAnimated("webp", webpContainer([webpVp8x(0, 8, 8), { type: "ANIM", body: [0, 0, 0, 0, 0, 0] }]))).toBe(true);
      expect(isAnimated("webp", webpContainer([webpVp8x(0x10, 8, 8)]))).toBe(false);
    });
  });

  describe("isLosslessWebp", () => {
    it("is true for VP8L and false for VP8", () => {
      expect(isLosslessWebp(files.webpLossless)).toBe(true);
      expect(isLosslessWebp(files.webpLossy)).toBe(false);
    });

    it("finds a VP8L chunk after a VP8X header", () => {
      expect(isLosslessWebp(webpContainer([webpVp8x(0, 8, 8), { type: "VP8L", body: [0x2f, 0, 0, 0, 0] }]))).toBe(true);
    });
  });
});
