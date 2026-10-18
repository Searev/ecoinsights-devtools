// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { dontResizeImagesRule } from "./dont-resize-images.rule";

type Img = {
  src: string;
  clientWidth: number;
  clientHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};
const img = (o: Partial<Img>): Img => ({
  src: "https://x.test/a.jpg",
  clientWidth: 100,
  clientHeight: 100,
  naturalWidth: 100,
  naturalHeight: 100,
  ...o,
});
const ev = (page: Img[] | undefined) =>
  dontResizeImagesRule.evaluate({ url: "https://x.test", requests: [], page });

describe("dontResizeImagesRule metadata", () => {
  it("has the expected id and category", () => {
    expect(dontResizeImagesRule.id).toBe("DontResizeImagesInBrowser");
    expect(dontResizeImagesRule.category).toBe("images");
  });
});

describe("dontResizeImagesRule.evaluate", () => {
  it("is A when there is no image", () => {
    const r = ev([]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune image n'a été redimensionnée dans le navigateur");
  });

  it("is A when images have their natural size or differ by 1px", () => {
    expect(ev([img({}), img({ naturalWidth: 101, naturalHeight: 101 })]).compliance).toBe("A");
  });

  it("is C when both dimensions are downscaled, with formatted offender", () => {
    const r = ev([
      img({
        src: "https://x.test/img/photo.jpg?v=2",
        clientWidth: 100,
        clientHeight: 50,
        naturalWidth: 400,
        naturalHeight: 200,
      }),
    ]);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([
      "photo.jpg?v=2 : affichée en 100x50 au lieu de 400x200",
    ]);
  });

  it("flags an image downscaled on one axis only (B8)", () => {
    expect(ev([img({ naturalWidth: 400 })]).compliance).toBe("C");
    expect(ev([img({ naturalHeight: 400 })]).compliance).toBe("C");
  });

  it("does not exclude URLs merely containing svg (B8)", () => {
    const r = ev([img({ src: "https://x.test/assets/svgs/photo.jpg", naturalWidth: 400, naturalHeight: 400 })]);
    expect(r.compliance).toBe("C");
  });

  it.each([
    "https://x.test/logo.svg",
    "https://x.test/logo.SVG?v=1",
    "data:image/svg+xml;base64,AAAA",
    "data:image/svg+xml,%3Csvg%3E",
  ])("ignores svg image %s", (src) => {
    expect(ev([img({ src, naturalWidth: 400, naturalHeight: 400 })]).compliance).toBe("A");
  });

  it("skips images with zero client width or height", () => {
    expect(ev([img({ clientWidth: 0, naturalWidth: 400 })]).compliance).toBe("A");
    expect(ev([img({ clientHeight: 0, naturalHeight: 400 })]).compliance).toBe("A");
  });

  it("does not penalise when the page could not be inspected", () => {
    const r = ev(undefined);
    expect(r.compliance).toBe("A");
    expect(r.detail).toMatch(/n'a pas pu être inspectée/);
  });
});

describe("dontResizeImagesRule.collect", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the raw dimensions of every img", () => {
    document.body.innerHTML = `<img src="https://x.test/a.jpg"><img src="https://x.test/b.png">`;
    const [a] = document.querySelectorAll("img");
    Object.defineProperty(a, "clientWidth", { value: 10 });
    Object.defineProperty(a, "clientHeight", { value: 20 });
    Object.defineProperty(a, "naturalWidth", { value: 30 });
    Object.defineProperty(a, "naturalHeight", { value: 40 });
    const res = dontResizeImagesRule.collect!();
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({
      src: "https://x.test/a.jpg",
      clientWidth: 10,
      clientHeight: 20,
      naturalWidth: 30,
      naturalHeight: 40,
    });
  });

  it("returns an empty list without images", () => {
    expect(dontResizeImagesRule.collect!()).toEqual([]);
  });
});
