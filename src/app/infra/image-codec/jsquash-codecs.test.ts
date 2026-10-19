import { beforeAll, describe, expect, it } from "vitest";
import { Codecs } from "./codecs";
import { createJsquashCodecs, CodecWasm } from "./jsquash-codecs";
import { loadWasmFromNodeModules } from "./testing/node-wasm";
import { makeRawImage } from "./testing/synthetic";
import { sniffImageFormat } from "../../domain/image-estimation/signature";

describe("jsquash codecs (real WASM)", () => {
  let codecs: Codecs;
  beforeAll(() => {
    codecs = createJsquashCodecs(loadWasmFromNodeModules);
  });

  const raw = makeRawImage(96, 64);
  const rgba = makeRawImage(96, 64, true);

  it("round-trips JPEG (mozjpeg) and keeps the size", async () => {
    const bytes = await codecs.encode(raw, { format: "jpeg", quality: 80 });
    expect(sniffImageFormat(bytes)).toBe("jpeg");
    const back = await codecs.decode("jpeg", bytes);
    expect([back.width, back.height]).toEqual([96, 64]);
    expect(back.data.length).toBe(96 * 64 * 4);
  });

  it("round-trips PNG (oxipng) losslessly", async () => {
    const bytes = await codecs.encode(rgba, { format: "png", level: 2 });
    expect(sniffImageFormat(bytes)).toBe("png");
    const back = await codecs.decode("png", bytes);
    expect([back.width, back.height]).toEqual([96, 64]);
    expect(Array.from(back.data)).toEqual(Array.from(rgba.data));
  });

  it("round-trips WebP lossy and lossless", async () => {
    const lossy = await codecs.encode(raw, { format: "webp", lossless: false, quality: 80 });
    const lossless = await codecs.encode(raw, { format: "webp", lossless: true });
    expect(sniffImageFormat(lossy)).toBe("webp");
    for (const bytes of [lossy, lossless]) {
      const back = await codecs.decode("webp", bytes);
      expect([back.width, back.height]).toEqual([96, 64]);
    }
    const exact = await codecs.decode("webp", lossless);
    expect(Array.from(exact.data)).toEqual(Array.from(raw.data));
  });

  it("round-trips AVIF and keeps the size", async () => {
    const bytes = await codecs.encode(raw, { format: "avif", quality: 65, speed: 8 });
    expect(sniffImageFormat(bytes)).toBe("avif");
    const back = await codecs.decode("avif", bytes);
    expect([back.width, back.height]).toEqual([96, 64]);
  });

  it("resizes to 48x32 (Lanczos3)", async () => {
    const small = await codecs.resize(raw, 48, 32);
    expect([small.width, small.height]).toEqual([48, 32]);
    expect(small.data.length).toBe(48 * 32 * 4);
  });

  it("does not modify the input image when resizing", async () => {
    const copy = new Uint8ClampedArray(raw.data);
    await codecs.resize(raw, 48, 32);
    expect(Array.from(raw.data)).toEqual(Array.from(copy));
  });

  it("rejects when decoding garbage", async () => {
    await expect(codecs.decode("jpeg", new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });

  it("loads each WASM module lazily and only once", async () => {
    const loaded: CodecWasm[] = [];
    const lazy = createJsquashCodecs((name) => {
      loaded.push(name);
      return loadWasmFromNodeModules(name);
    });
    expect(loaded).toEqual([]);
    await lazy.encode(raw, { format: "jpeg", quality: 80 });
    await lazy.encode(raw, { format: "jpeg", quality: 70 });
    expect(loaded).toEqual(["jpeg-enc"]);
  });

  it("retries the load after a failure", async () => {
    let attempts = 0;
    const flaky = createJsquashCodecs((name) => {
      if (attempts++ === 0) return Promise.reject(new Error("network"));
      return loadWasmFromNodeModules(name);
    });
    await expect(flaky.encode(raw, { format: "jpeg", quality: 80 })).rejects.toThrow("network");
    await expect(flaky.encode(raw, { format: "jpeg", quality: 80 })).resolves.toBeInstanceOf(Uint8Array);
  });
});
