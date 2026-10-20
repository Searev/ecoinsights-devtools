import { beforeAll, describe, expect, it } from "vitest";
import { sniffImageFormat } from "../../domain/image-estimation/signature";
import { MAX_IMAGE_BYTES, OWN_FORMAT_ENCODING, RECOMMENDED_ENCODING } from "../../domain/image-estimation/policy";
import { EstimationJob, EstimationOutcome, ImageTransform } from "../../domain/models/image-estimation";
import { Codecs } from "./codecs";
import { createJsquashCodecs } from "./jsquash-codecs";
import { createEstimationPipeline, createImagePipeline } from "./pipeline";
import { createFakeCodecs } from "./testing/fake-codecs";
import { loadWasmFromNodeModules } from "./testing/node-wasm";
import {
  ascii,
  gifBytes,
  htmlBytes,
  icoBytes,
  pngChunk,
  pngHeader,
  sampleFiles,
  toBase64,
  webpContainer,
  webpVp8x,
} from "./testing/synthetic";

const job = (transform: ImageTransform, declaredType: string, url = "https://x.test/a"): EstimationJob => ({
  url,
  declaredType,
  transform,
});
const b64 = (bytes: Uint8Array) => ({ kind: "base64" as const, data: toBase64(bytes) });
const HALF = { kind: "resize", width: 48, height: 32 } as const;
const CONVERT = { kind: "convert" } as const;

describe("estimation pipeline (real codecs)", () => {
  let codecs: Codecs;
  let files: Awaited<ReturnType<typeof sampleFiles>>;
  let run: ReturnType<typeof createEstimationPipeline>;
  beforeAll(async () => {
    codecs = createJsquashCodecs(loadWasmFromNodeModules);
    files = await sampleFiles(codecs, 96, 64);
    run = createEstimationPipeline(codecs);
  });

  const estimate = (transform: ImageTransform, declaredType: string, bytes: Uint8Array): Promise<EstimationOutcome> =>
    run({ job: job(transform, declaredType), source: b64(bytes) });

  describe("resize (US-001)", () => {
    it("re-encodes a JPEG resized to half in mozjpeg q80 and gets smaller", async () => {
      const outcome = await estimate(HALF, "image/jpeg", files.jpeg);
      expect(outcome).toEqual({
        status: "estimated",
        sourceFormat: "jpeg",
        target: OWN_FORMAT_ENCODING.jpeg,
        sourceBytes: files.jpeg.length,
        encodedBytes: expect.any(Number),
        width: 96,
        height: 64,
      });
      if (outcome.status === "estimated") expect(outcome.encodedBytes).toBeLessThan(outcome.sourceBytes);
      expect(OWN_FORMAT_ENCODING.jpeg).toEqual({ format: "jpeg", quality: 80 });
    });

    it("keeps each format's own encoding: PNG oxipng, WebP lossy q80, AVIF q65 speed 6", async () => {
      const png = await estimate(HALF, "image/png", files.png);
      const webp = await estimate(HALF, "image/webp", files.webpLossy);
      const avif = await estimate(HALF, "image/avif", files.avif);
      expect(png).toMatchObject({ status: "estimated", target: { format: "png", level: 2 } });
      expect(webp).toMatchObject({ status: "estimated", target: { format: "webp", lossless: false, quality: 80 } });
      expect(avif).toMatchObject({ status: "estimated", target: { format: "avif", quality: 65, speed: 6 } });
    });

    it("re-encodes a lossless (VP8L) WebP losslessly", async () => {
      expect(await estimate(HALF, "image/webp", files.webpLossless)).toMatchObject({
        status: "estimated",
        target: { format: "webp", lossless: true },
      });
    });

    it("re-encodes without resizing when the target is not smaller than the natural size", async () => {
      const spy = countingCodecs(codecs);
      const outcome = await createEstimationPipeline(spy.codecs)({
        job: job({ kind: "resize", width: 96, height: 64 }, "image/jpeg"),
        source: b64(files.jpeg),
      });
      expect(outcome.status).toBe("estimated");
      expect(spy.calls.resize).toBe(0);
    });

    it("accepts binary bytes as well as base64", async () => {
      const copy = files.jpeg.slice();
      const outcome = await run({
        job: job(HALF, "image/jpeg"),
        source: { kind: "binary", data: copy.buffer },
      });
      expect(outcome).toMatchObject({ status: "estimated", sourceBytes: files.jpeg.length });
    });
  });

  describe("convert (US-002) and resize-convert (US-003)", () => {
    it("converts a JPEG to AVIF q65 speed 6", async () => {
      const outcome = await estimate(CONVERT, "image/jpeg", files.jpeg);
      expect(outcome).toMatchObject({ status: "estimated", sourceFormat: "jpeg", target: RECOMMENDED_ENCODING.jpeg });
      expect(RECOMMENDED_ENCODING.jpeg).toEqual({ format: "avif", quality: 65, speed: 6 });
    });

    it("converts a PNG to lossless WebP", async () => {
      const outcome = await estimate(CONVERT, "image/png", files.png);
      expect(outcome).toMatchObject({ status: "estimated", sourceFormat: "png", target: { format: "webp", lossless: true } });
    });

    it("resize-convert resizes then encodes once, smaller than convert alone", async () => {
      const full = await estimate(CONVERT, "image/jpeg", files.jpeg);
      const both = await estimate({ kind: "resize-convert", width: 48, height: 32 }, "image/jpeg", files.jpeg);
      expect(both).toMatchObject({ status: "estimated", target: RECOMMENDED_ENCODING.jpeg, width: 96, height: 64 });
      if (full.status === "estimated" && both.status === "estimated") {
        expect(both.encodedBytes).toBeLessThan(full.encodedBytes);
      }
    });

    it("skips WebP and AVIF as already optimised", async () => {
      expect(await estimate(CONVERT, "image/webp", files.webpLossy)).toEqual({
        status: "skipped",
        reason: "already-optimised",
        sourceFormat: "webp",
      });
      expect(await estimate(CONVERT, "image/avif", files.avif)).toEqual({
        status: "skipped",
        reason: "already-optimised",
        sourceFormat: "avif",
      });
    });

    it("trusts the MIME type over the bytes: image/webp carrying JPEG bytes is a WebP", async () => {
      expect(await estimate(CONVERT, "image/webp", files.jpeg)).toMatchObject({
        status: "skipped",
        reason: "already-optimised",
        sourceFormat: "webp",
      });
    });

    it("falls back to the signature for a generic MIME type", async () => {
      expect(await estimate(CONVERT, "application/octet-stream", files.png)).toMatchObject({
        status: "estimated",
        sourceFormat: "png",
        target: { format: "webp", lossless: true },
      });
      expect(await estimate(CONVERT, "", files.jpeg)).toMatchObject({ status: "estimated", sourceFormat: "jpeg" });
    });

    it("skips a generic MIME type whose bytes are not an image", async () => {
      expect(await estimate(CONVERT, "application/octet-stream", htmlBytes())).toEqual({
        status: "skipped",
        reason: "not-an-image",
      });
    });
  });

  describe("scope guards", () => {
    it("skips GIF and ICO as unsupported formats", async () => {
      expect(await estimate(HALF, "image/gif", gifBytes())).toEqual({
        status: "skipped",
        reason: "unsupported-format",
        sourceFormat: "gif",
      });
      expect(await estimate(CONVERT, "image/x-icon", icoBytes())).toEqual({
        status: "skipped",
        reason: "unsupported-format",
        sourceFormat: "ico",
      });
    });

    it("skips an APNG and an animated WebP", async () => {
      const apng = pngHeader(8, 8, [pngChunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0])]);
      const webp = webpContainer([webpVp8x(0x02, 8, 8)]);
      expect(await estimate(HALF, "image/png", apng)).toMatchObject({ status: "skipped", reason: "animated" });
      expect(await estimate(HALF, "image/webp", webp)).toMatchObject({ status: "skipped", reason: "animated" });
    });

    it("skips an image over 10 MB without decoding", async () => {
      const fake = createFakeCodecs();
      const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
      big.set(pngHeader(10, 10));
      const outcome = await createEstimationPipeline(fake)({ job: job(HALF, "image/png"), source: b64(big) });
      expect(outcome).toMatchObject({ status: "skipped", reason: "too-large" });
      expect(fake.calls.decode).toBe(0);
    });
  });

  it("is deterministic: the same input twice gives the same encoded size", async () => {
    const a = await estimate({ kind: "resize-convert", width: 48, height: 32 }, "image/jpeg", files.jpeg);
    const b = await estimate({ kind: "resize-convert", width: 48, height: 32 }, "image/jpeg", files.jpeg);
    expect(a).toEqual(b);
  });
});

describe("estimation pipeline (fake codecs)", () => {
  const png = () => pngHeader(100, 80);

  it("skips a PNG header declaring 6000x5000 before decoding", async () => {
    const fake = createFakeCodecs();
    const outcome = await createEstimationPipeline(fake)({ job: job(HALF, "image/png"), source: b64(pngHeader(6000, 5000)) });
    expect(outcome).toMatchObject({ status: "skipped", reason: "too-large" });
    expect(fake.calls).toEqual({ decode: 0, resize: 0, encode: 0 });
  });

  it("fails with decode-failed when decoding throws", async () => {
    const fake = createFakeCodecs();
    fake.failDecode = true;
    expect(await createEstimationPipeline(fake)({ job: job(HALF, "image/png"), source: b64(png()) })).toMatchObject({
      status: "failed",
      reason: "decode-failed",
    });
  });

  it("fails with encode-failed when encoding or resizing throws", async () => {
    const fake = createFakeCodecs();
    fake.failEncode = true;
    const run = createEstimationPipeline(fake);
    expect(await run({ job: job(CONVERT, "image/png"), source: b64(png()) })).toMatchObject({
      status: "failed",
      reason: "encode-failed",
    });
    fake.failEncode = false;
    fake.failResize = true;
    expect(await run({ job: job(HALF, "image/png"), source: b64(png()) })).toMatchObject({
      status: "failed",
      reason: "encode-failed",
    });
  });

  it("fails with bytes-unavailable on invalid base64", async () => {
    const run = createEstimationPipeline(createFakeCodecs());
    expect(await run({ job: job(HALF, "image/png"), source: { kind: "base64", data: "%%%not base64%%%" } })).toMatchObject({
      status: "failed",
      reason: "bytes-unavailable",
    });
  });

  it("decodes once for the three jobs of one URL, and again when the bytes change", async () => {
    const fake = createFakeCodecs();
    const run = createEstimationPipeline(fake);
    const source = b64(png());
    await run({ job: job(HALF, "image/png"), source });
    await run({ job: job(CONVERT, "image/png"), source });
    await run({ job: job({ kind: "resize-convert", width: 48, height: 32 }, "image/png"), source });
    expect(fake.calls.decode).toBe(1);
    await run({ job: job(HALF, "image/png", "https://x.test/b"), source });
    expect(fake.calls.decode).toBe(2);
    await run({ job: job(HALF, "image/png"), source: b64(new Uint8Array([...png(), ...ascii("x")])) });
    expect(fake.calls.decode).toBe(3);
  });

  it("never rejects, even on an unexpected error", async () => {
    const fake = createFakeCodecs();
    fake.decode = () => {
      throw new Error("sync boom");
    };
    expect(await createEstimationPipeline(fake)({ job: job(HALF, "image/png"), source: b64(png()) })).toMatchObject({
      status: "failed",
    });
  });
});

function countingCodecs(inner: Codecs) {
  const calls = { decode: 0, resize: 0, encode: 0 };
  const codecs: Codecs = {
    decode: (...args) => (calls.decode++, inner.decode(...args)),
    resize: (...args) => (calls.resize++, inner.resize(...args)),
    encode: (...args) => (calls.encode++, inner.encode(...args)),
  };
  return { codecs, calls };
}

describe("image pipeline: generate and inspect (real codecs)", () => {
  let files: Awaited<ReturnType<typeof sampleFiles>>;
  let pipeline: ReturnType<typeof createImagePipeline>;
  beforeAll(async () => {
    const codecs = createJsquashCodecs(loadWasmFromNodeModules);
    files = await sampleFiles(codecs, 96, 64);
    pipeline = createImagePipeline(codecs);
  });

  const RESIZE_CONVERT = { kind: "resize-convert", width: 48, height: 32 } as const;
  const cases: Array<[string, ImageTransform, string, () => Uint8Array, string]> = [
    ["JPEG resize", HALF, "image/jpeg", () => files.jpeg, "jpeg"],
    ["JPEG convert to AVIF", CONVERT, "image/jpeg", () => files.jpeg, "avif"],
    ["PNG convert to lossless WebP", CONVERT, "image/png", () => files.png, "webp"],
    ["JPEG resize-convert", RESIZE_CONVERT, "image/jpeg", () => files.jpeg, "avif"],
  ];

  it.each(cases)("generate(%s) has exactly the estimated byte length", async (_name, transform, type, bytes, format) => {
    const request = { job: job(transform, type), source: b64(bytes()) };
    const estimated = await pipeline.estimate(request);
    const generated = await pipeline.generate(request);
    expect(estimated.status).toBe("estimated");
    if (estimated.status !== "estimated" || !generated.ok) throw new Error("expected success");
    expect(generated.info.byteLength).toBe(estimated.encodedBytes);
    expect(generated.bytes.length).toBe(estimated.encodedBytes);
    expect(sniffImageFormat(generated.bytes)).toBe(format);
    expect(generated.info.format).toBe(format);
  });

  it("generate reports the output size: resized to the target, natural for a convert", async () => {
    const resized = await pipeline.generate({ job: job(HALF, "image/jpeg"), source: b64(files.jpeg) });
    expect(resized).toMatchObject({ ok: true, info: { format: "jpeg", width: 48, height: 32, mimeType: "image/jpeg" } });
    const converted = await pipeline.generate({ job: job(CONVERT, "image/jpeg"), source: b64(files.jpeg) });
    expect(converted).toMatchObject({ ok: true, info: { format: "avif", width: 96, height: 64, mimeType: "image/avif" } });
    const both = await pipeline.generate({ job: job(RESIZE_CONVERT, "image/jpeg"), source: b64(files.jpeg) });
    expect(both).toMatchObject({ ok: true, info: { format: "avif", width: 48, height: 32 } });
  });

  it("generate flags a lossless WebP and gives no lossless field for other formats", async () => {
    const webp = await pipeline.generate({ job: job(CONVERT, "image/png"), source: b64(files.png) });
    expect(webp).toMatchObject({ ok: true, info: { format: "webp", lossless: true, mimeType: "image/webp" } });
    const jpeg = await pipeline.generate({ job: job(HALF, "image/jpeg"), source: b64(files.jpeg) });
    expect(jpeg.ok && jpeg.info.lossless).toBeUndefined();
  });

  it("generate returns the reason of a non-estimated outcome", async () => {
    expect(await pipeline.generate({ job: job(CONVERT, "image/webp"), source: b64(files.webpLossy) })).toEqual({
      ok: false,
      reason: "already-optimised",
    });
    expect(await pipeline.generate({ job: job(CONVERT, "application/octet-stream"), source: b64(htmlBytes()) })).toEqual({
      ok: false,
      reason: "not-an-image",
    });
  });

  it.each([
    ["JPEG", "image/jpeg", () => files.jpeg, "jpeg"],
    ["PNG", "image/png", () => files.png, "png"],
  ] as const)("inspect returns the %s bytes untouched, base64 or binary", async (_n, type, bytes, format) => {
    const original = bytes();
    const fromBase64 = await pipeline.inspect({ declaredType: type, source: b64(original) });
    const fromBinary = await pipeline.inspect({
      declaredType: type,
      source: { kind: "binary", data: original.slice().buffer },
    });
    for (const result of [fromBase64, fromBinary]) {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Array.from(result.bytes)).toEqual(Array.from(original));
      expect(result.info).toEqual({
        format,
        width: 96,
        height: 64,
        byteLength: original.length,
        mimeType: type,
      });
    }
  });

  it("inspect flags lossless and lossy WebP", async () => {
    const lossless = await pipeline.inspect({ declaredType: "image/webp", source: b64(files.webpLossless) });
    expect(lossless).toMatchObject({ ok: true, info: { format: "webp", lossless: true } });
    const lossy = await pipeline.inspect({ declaredType: "", source: b64(files.webpLossy) });
    expect(lossy).toMatchObject({ ok: true, info: { format: "webp", lossless: false } });
  });

  it("inspect refuses what is not an image, unsupported formats and huge files", async () => {
    expect(await pipeline.inspect({ declaredType: "application/octet-stream", source: b64(htmlBytes()) })).toEqual({
      ok: false,
      reason: "not-an-image",
    });
    expect(await pipeline.inspect({ declaredType: "image/gif", source: b64(gifBytes()) })).toEqual({
      ok: false,
      reason: "unsupported-format",
    });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(pngHeader(10, 10));
    expect(await pipeline.inspect({ declaredType: "image/png", source: b64(big) })).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("inspect reports bytes-unavailable on invalid base64 and never rejects", async () => {
    expect(await pipeline.inspect({ declaredType: "image/png", source: { kind: "base64", data: "%%%" } })).toMatchObject({
      ok: false,
      reason: "bytes-unavailable",
    });
  });
});

describe("image pipeline: generate and inspect (fake codecs)", () => {
  const png = () => pngHeader(100, 80);

  it("generate fails with encode-failed when encoding throws", async () => {
    const fake = createFakeCodecs();
    fake.failEncode = true;
    const result = await createImagePipeline(fake).generate({ job: job(CONVERT, "image/png"), source: b64(png()) });
    expect(result).toMatchObject({ ok: false, reason: "encode-failed", message: "encode boom" });
  });

  it("generate fails with decode-failed when decoding throws", async () => {
    const fake = createFakeCodecs();
    fake.failDecode = true;
    expect(await createImagePipeline(fake).generate({ job: job(HALF, "image/png"), source: b64(png()) })).toMatchObject({
      ok: false,
      reason: "decode-failed",
    });
  });

  it("estimate and generate of the same URL decode once", async () => {
    const fake = createFakeCodecs();
    const pipeline = createImagePipeline(fake);
    const request = { job: job(HALF, "image/png"), source: b64(png()) };
    await pipeline.estimate(request);
    await pipeline.generate(request);
    expect(fake.calls.decode).toBe(1);
  });

  it("inspect reads the size from the header without decoding, and decodes when the header is unreadable", async () => {
    const fake = createFakeCodecs({ width: 7, height: 5 });
    const pipeline = createImagePipeline(fake);
    expect(await pipeline.inspect({ declaredType: "image/png", source: b64(png()) })).toMatchObject({
      ok: true,
      info: { width: 100, height: 80 },
    });
    expect(fake.calls.decode).toBe(0);
    const jpegLike = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2]);
    expect(await pipeline.inspect({ declaredType: "image/jpeg", source: b64(jpegLike) })).toMatchObject({
      ok: true,
      info: { width: 7, height: 5 },
    });
    expect(fake.calls.decode).toBe(1);
  });

  it("inspect reports decode-failed and never rejects", async () => {
    const fake = createFakeCodecs();
    fake.failDecode = true;
    const jpegLike = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2]);
    expect(
      await createImagePipeline(fake).inspect({ declaredType: "image/jpeg", source: b64(jpegLike) }),
    ).toMatchObject({ ok: false, reason: "decode-failed" });
  });
});
