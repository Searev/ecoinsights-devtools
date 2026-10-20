import { describe, expect, it } from "vitest";
import { PreviewFileLoader } from "../../domain/models/file-preview";
import { FakePreviewFileLoader } from "./fake-preview-file-loader";

const loader = (): PreviewFileLoader => new FakePreviewFileLoader();
import { describePreviewImage } from "./preview-image-info";

describe("FakePreviewFileLoader (dev)", () => {
  it("loads a synthetic 600 x 400 SVG labelled with the file name", async () => {
    const result = await loader().loadImage("https://a.test/img/hero.jpg", "image/jpeg");
    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") return;
    expect(result.info).toMatchObject({ format: "svg", vector: true, width: 600, height: 400, mimeType: "image/svg+xml" });
    expect(result.info.byteLength).toBe(result.bytes.length);
    expect(new TextDecoder().decode(result.bytes)).toContain("hero.jpg");
    expect(describePreviewImage(result.bytes, "image/svg+xml")).toEqual(result.info);
  });

  it("escapes the file name in the SVG", async () => {
    const result = await loader().loadImage("https://a.test/a%3Cb&c.png", "");
    if (result.status !== "loaded") throw new Error("expected loaded");
    expect(new TextDecoder().decode(result.bytes)).not.toMatch(/<b|&c/);
  });

  it("reports fonts as unavailable in demo mode", async () => {
    expect(await loader().loadFont("https://a.test/f.woff2", "font/woff2")).toEqual({
      status: "error",
      error: "unavailable",
      message: "aperçu des polices indisponible en mode démo",
    });
  });
});
