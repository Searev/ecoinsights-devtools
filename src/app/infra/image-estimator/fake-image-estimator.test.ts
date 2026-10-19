import { describe, expect, it } from "vitest";
import { OWN_FORMAT_ENCODING, RECOMMENDED_ENCODING } from "../../domain/image-estimation/policy";
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
});
