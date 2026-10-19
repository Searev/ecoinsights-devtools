import { describe, expect, it } from "vitest";
import { estimationKey, imageGainStatus } from "./image-estimation";

describe("estimationKey", () => {
  it("distinguishes transformations of the same URL (US-002 §3)", () => {
    const url = "https://x.test/a.jpg";
    const keys = [
      estimationKey({ url, declaredType: "image/jpeg", transform: { kind: "resize", width: 600, height: 400 } }),
      estimationKey({ url, declaredType: "image/jpeg", transform: { kind: "resize", width: 300, height: 200 } }),
      estimationKey({ url, declaredType: "image/jpeg", transform: { kind: "convert" } }),
      estimationKey({ url, declaredType: "image/jpeg", transform: { kind: "resize-convert", width: 600, height: 400 } }),
    ];
    expect(new Set(keys).size).toBe(4);
  });
  it("ignores the declared type", () => {
    const transform = { kind: "convert" } as const;
    expect(estimationKey({ url: "u", declaredType: "", transform })).toBe(
      estimationKey({ url: "u", declaredType: "image/png", transform })
    );
  });
});

describe("imageGainStatus", () => {
  const gain = { bytes: 0, pendingCount: 0, notEvaluatedCount: 0, fallbackCount: 0 };
  it("is pending while any image is pending", () => {
    expect(imageGainStatus({ ...gain, pendingCount: 1, notEvaluatedCount: 1 })).toBe("pending");
  });
  it("is partial when images were not evaluated or fell back", () => {
    expect(imageGainStatus({ ...gain, notEvaluatedCount: 2 })).toBe("partial");
    expect(imageGainStatus({ ...gain, fallbackCount: 1 })).toBe("partial");
  });
  it("is complete otherwise", () => {
    expect(imageGainStatus(gain)).toBe("complete");
  });
});
