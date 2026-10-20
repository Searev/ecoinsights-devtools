import { describe, expect, it } from "vitest";
import { MediaElementLike, mediaDisplaySize, releaseMedia } from "./media-element";

function fakeElement(throwing: string[] = []) {
  const calls: string[] = [];
  const call = (name: string) => {
    calls.push(name);
    if (throwing.includes(name)) throw new Error(name);
  };
  const el: MediaElementLike = {
    pause: () => call("pause"),
    removeAttribute: (name) => call(`removeAttribute(${name})`),
    load: () => call("load"),
  };
  return { el, calls };
}

describe("releaseMedia", () => {
  it("pauses, removes the source, then reloads", () => {
    const { el, calls } = fakeElement();
    releaseMedia(el);
    expect(calls).toEqual(["pause", "removeAttribute(src)", "load"]);
  });

  it.each(["pause", "removeAttribute(src)", "load"])("survives a throwing %s", (name) => {
    const { el, calls } = fakeElement([name]);
    expect(() => releaseMedia(el)).not.toThrow();
    expect(calls).toEqual(["pause", "removeAttribute(src)", "load"]);
  });
});

describe("mediaDisplaySize", () => {
  const display = { width: 640, height: 360 };
  const metadata = { duration: 10, width: 1920, height: 1080 };

  it("uses the page box in page mode", () => {
    expect(
      mediaDisplaySize({ mode: "page", display, metadata, areaWidth: 1000, devicePixelRatio: 2 }),
    ).toEqual({ width: 640, height: 360 });
  });

  it("scales the page box down to the area", () => {
    expect(
      mediaDisplaySize({ mode: "page", display, metadata, areaWidth: 320, devicePixelRatio: 1 }),
    ).toEqual({ width: 320, height: 180 });
  });

  it("uses the natural size divided by the pixel ratio in native mode", () => {
    expect(
      mediaDisplaySize({ mode: "native", display, metadata, areaWidth: 1000, devicePixelRatio: 2 }),
    ).toEqual({ width: 960, height: 540 });
  });

  it("is undefined before the metadata in native mode, or without a natural size", () => {
    expect(
      mediaDisplaySize({ mode: "native", display, areaWidth: 1000, devicePixelRatio: 1 }),
    ).toBeUndefined();
    expect(
      mediaDisplaySize({
        mode: "native",
        metadata: { duration: 1, width: 0, height: 0 },
        areaWidth: 1000,
        devicePixelRatio: 1,
      }),
    ).toBeUndefined();
  });

  it("is undefined in page mode without a displayed box", () => {
    expect(
      mediaDisplaySize({ mode: "page", display: { width: 0, height: 0 }, metadata, areaWidth: 1, devicePixelRatio: 1 }),
    ).toBeUndefined();
    expect(mediaDisplaySize({ mode: "page", metadata, areaWidth: 1, devicePixelRatio: 1 })).toBeUndefined();
  });
});
