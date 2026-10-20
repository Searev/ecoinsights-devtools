import { describe, expect, it } from "vitest";
import { OWN_FORMAT_ENCODING, RECOMMENDED_ENCODING } from "../../domain/image-estimation/policy";
import { ImageVariantGenerator } from "../../domain/models/image-variants";
import { EstimationJob } from "../../domain/models/image-estimation";
import { FakeImageEstimator } from "./fake-image-estimator";

describe("FakeImageEstimator", () => {
  it("estimates 100 kB down to 40 kB with the recommended encoding for a convert job", async () => {
    const outcome = await new FakeImageEstimator().estimate({
      url: "https://x.test/a.png",
      declaredType: "image/png",
      transform: { kind: "convert" },
    });
    expect(outcome).toMatchObject({
      status: "estimated",
      sourceFormat: "png",
      sourceBytes: 100_000,
      encodedBytes: 40_000,
      target: RECOMMENDED_ENCODING.png,
    });
  });

  it("defaults to jpeg and uses the own-format encoding for a resize job", async () => {
    const outcome = await new FakeImageEstimator().estimate({
      url: "https://x.test/a",
      declaredType: "",
      transform: { kind: "resize", width: 10, height: 10 },
    });
    expect(outcome).toMatchObject({ status: "estimated", sourceFormat: "jpeg", target: OWN_FORMAT_ENCODING.jpeg });
  });

  describe("ImageVariantGenerator", () => {
    const generator = (): ImageVariantGenerator => new FakeImageEstimator();
    const svgText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    const job = (transform: EstimationJob["transform"]): EstimationJob => ({
      url: "https://x.test/a.jpg",
      declaredType: "image/jpeg",
      transform,
    });

    it("loads a synthetic 1000 x 1000 SVG original with fixed info", async () => {
      const result = await generator().loadOriginal("https://x.test/a.jpg", "image/jpeg");
      expect(result.status).toBe("loaded");
      if (result.status !== "loaded") return;
      expect(result.info).toEqual({ format: "svg", width: 1000, height: 1000, byteLength: 100_000, mimeType: "image/svg+xml" });
      const text = svgText(result.bytes);
      expect(text).toContain("<svg");
      expect(text).toContain('width="1000"');
      expect(text).toContain('height="1000"');
    });

    it("generates the job's target size for resize and resize-convert, 1000 x 1000 for convert", async () => {
      const fake = generator();
      const original = new Uint8Array([1]);
      for (const transform of [
        { kind: "resize", width: 300, height: 200 },
        { kind: "resize-convert", width: 300, height: 200 },
      ] as const) {
        const result = await fake.generate(job(transform), original);
        expect(result).toMatchObject({ status: "loaded", info: { width: 300, height: 200, byteLength: 40_000, mimeType: "image/svg+xml" } });
        if (result.status === "loaded") expect(svgText(result.bytes)).toContain('width="300"');
      }
      expect(await fake.generate(job({ kind: "convert" }), original)).toMatchObject({
        status: "loaded",
        info: { width: 1000, height: 1000, byteLength: 40_000 },
      });
    });

    it("is deterministic", async () => {
      const fake = generator();
      const a = await fake.generate(job({ kind: "convert" }), new Uint8Array());
      const b = await fake.generate(job({ kind: "convert" }), new Uint8Array());
      expect(a).toEqual(b);
    });
  });
});
