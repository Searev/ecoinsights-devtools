import { describe, expect, it } from "vitest";
import { ImagePreviewSubject, PreviewImageInfo } from "../../../domain/models/file-preview";
import { imagePreviewSize, initialImageMode, isDisplayedBox } from "./image-preview-layout";

function info(o: Partial<PreviewImageInfo> = {}): PreviewImageInfo {
  return { format: "jpeg", animated: false, vector: false, width: 1200, height: 800, byteLength: 1, mimeType: "image/jpeg", ...o };
}
const subject = (display?: { width: number; height: number }): ImagePreviewSubject => ({
  kind: "image",
  url: "https://x.test/a.jpg",
  ruleId: "r",
  declaredType: "",
  display,
});

describe("isDisplayedBox / initialImageMode", () => {
  it("requires a box with both sides positive", () => {
    expect(isDisplayedBox({ width: 600, height: 400 })).toBe(true);
    expect(isDisplayedBox({ width: 0, height: 0 })).toBe(false);
    expect(isDisplayedBox({ width: 10, height: 0 })).toBe(false);
    expect(isDisplayedBox(undefined)).toBe(false);
  });
  it("opens in page mode only when displayed", () => {
    expect(initialImageMode(subject({ width: 600, height: 400 }))).toBe("page");
    expect(initialImageMode(subject({ width: 0, height: 0 }))).toBe("native");
    expect(initialImageMode(subject())).toBe("native");
  });
});

describe("imagePreviewSize", () => {
  const base = { display: { width: 600, height: 400 }, info: info(), areaWidth: 1000, devicePixelRatio: 2 };
  it("draws the page box in page mode", () => {
    expect(imagePreviewSize({ ...base, mode: "page" })).toEqual({ width: 600, height: 400 });
  });
  it("scales the page box down", () => {
    expect(imagePreviewSize({ ...base, mode: "page", areaWidth: 300 })).toEqual({ width: 300, height: 200 });
  });
  it("divides the natural size by the device pixel ratio in native mode (scenario 2)", () => {
    expect(imagePreviewSize({ ...base, mode: "native" })).toEqual({ width: 600, height: 400 });
  });
  it("uses the decoded size of a raster without info size", () => {
    expect(
      imagePreviewSize({ ...base, mode: "native", info: info({ width: undefined, height: undefined }), decoded: { width: 100, height: 50 } })
    ).toEqual({ width: 50, height: 25 });
  });
  it("leaves the browser size for a raster of unknown size", () => {
    expect(
      imagePreviewSize({ ...base, mode: "native", info: info({ width: undefined, height: undefined }) })
    ).toBeUndefined();
  });
  const svg = info({ format: "svg", vector: true, width: undefined, height: undefined });
  it("vector without size: display box if displayed, else browser size", () => {
    expect(imagePreviewSize({ ...base, mode: "native", info: svg, decoded: { width: 9, height: 9 } })).toEqual({
      width: 600,
      height: 400,
    });
    expect(imagePreviewSize({ ...base, mode: "native", info: svg, display: undefined })).toBeUndefined();
  });
  it("vector with an intrinsic size follows the native rule", () => {
    expect(
      imagePreviewSize({ ...base, mode: "native", info: info({ vector: true, format: "svg", width: 100, height: 50 }) })
    ).toEqual({ width: 50, height: 25 });
  });
  it("not displayed in page mode falls back to native rules", () => {
    expect(imagePreviewSize({ ...base, mode: "page", display: undefined })).toEqual({ width: 600, height: 400 });
  });
});
