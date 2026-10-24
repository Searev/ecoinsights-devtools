import { describe, expect, it } from "vitest";
import { createSessionFileCache } from "../image-comparison/session-file-cache";
import { createImageVariantStore } from "../image-comparison/variant-store";
import { FakeVariantGenerator, loadedFile } from "../image-comparison/testing/fake-variant-generator";
import { FakePreviewFileLoader, loadedFont, loadedImage, loadedText } from "./testing/fake-preview-file-loader";
import { createPreviewFileStore } from "./preview-store";

const GIF = "https://x.test/anim.gif";
const FONT = "https://f.test/r.woff2";

function setup(maxBytes = 1_000) {
  const loader = new FakePreviewFileLoader();
  const cache = createSessionFileCache(maxBytes);
  const store = createPreviewFileStore(loader, { cache });
  return { loader, cache, store };
}

describe("createPreviewFileStore: images", () => {
  it("loads once, then serves the cache (US-015 S10)", async () => {
    const { loader, store } = setup();
    const first = store.image(GIF, "image/gif");
    expect(loader.images).toHaveLength(1);
    expect(loader.images[0]).toMatchObject({ url: GIF, declaredType: "image/gif" });
    loader.images[0].resolve(loadedImage(100, { format: "gif", animated: true }));
    expect(await first).toMatchObject({ status: "loaded", info: { format: "gif", animated: true } });
    expect(store.peekImage(GIF)).toMatchObject({ status: "loaded" });
    expect((await store.image(GIF, "image/gif")).status).toBe("loaded");
    expect(loader.images).toHaveLength(1);
  });

  it("shares one load between concurrent calls, and completes without any caller", async () => {
    const { loader, store } = setup();
    const p1 = store.image(GIF, "");
    const p2 = store.image(GIF, "");
    expect(loader.images).toHaveLength(1);
    loader.images[0].resolve(loadedImage(10));
    await Promise.all([p1, p2]);
    expect(store.peekImage(GIF)).toBeDefined();
  });

  it("never caches an error: the next call retries (US-015 S8)", async () => {
    const { loader, store } = setup();
    const p1 = store.image(GIF, "");
    loader.images[0].resolve({ status: "error", error: "unavailable", message: "HTTP 404" });
    expect(await p1).toEqual({ status: "error", error: "unavailable", message: "HTTP 404" });
    expect(store.peekImage(GIF)).toBeUndefined();
    const p2 = store.image(GIF, "");
    expect(loader.images).toHaveLength(2);
    loader.images[1].resolve(loadedImage(10));
    expect((await p2).status).toBe("loaded");
  });

  it("turns a rejecting loader into `unavailable`", async () => {
    const { loader, store } = setup();
    const p = store.image(GIF, "");
    loader.images[0].reject(new Error("boom"));
    expect(await p).toEqual({ status: "error", error: "unavailable", message: "boom" });
  });

  it("peek returns undefined before any load", () => {
    const { store } = setup();
    expect(store.peekImage(GIF)).toBeUndefined();
    expect(store.peekFont(FONT)).toBeUndefined();
  });
});

describe("createPreviewFileStore: fonts", () => {
  it("caches fonts separately from images with the same URL", async () => {
    const { loader, store } = setup();
    const font = store.font(FONT, "font/woff2");
    loader.fonts[0].resolve(loadedFont(50));
    expect((await font).status).toBe("loaded");
    expect(store.peekFont(FONT)).toMatchObject({ status: "loaded", info: { format: "woff2" } });
    expect(store.peekImage(FONT)).toBeUndefined();
  });
});

describe("createPreviewFileStore: texts (US-020)", () => {
  it("passes the charset, caches the bytes and serves peekText (S13)", async () => {
    const loader = new FakePreviewFileLoader();
    const store = createPreviewFileStore(loader);
    expect(store.peekText("https://x.test/a.css")).toBeUndefined();
    const first = store.text("https://x.test/a.css", "text/css", "iso-8859-1");
    expect(loader.texts).toHaveLength(1);
    expect(loader.texts[0]).toMatchObject({ url: "https://x.test/a.css", declaredType: "text/css", charset: "iso-8859-1" });
    loader.texts[0].resolve(loadedText("a{}"));
    expect(await first).toMatchObject({ status: "loaded", info: { byteLength: 3, charset: "utf-8" } });
    expect(store.peekText("https://x.test/a.css")).toMatchObject({ status: "loaded" });
    await store.text("https://x.test/a.css", "text/css");
    expect(loader.texts).toHaveLength(1);
  });

  it("caches texts separately from images and fonts with the same URL, and never caches an error", async () => {
    const loader = new FakePreviewFileLoader();
    const store = createPreviewFileStore(loader);
    const failed = store.text("https://x.test/a", "");
    loader.texts[0].resolve({ status: "error", error: "unavailable" });
    expect(await failed).toEqual({ status: "error", error: "unavailable" });
    expect(store.peekText("https://x.test/a")).toBeUndefined();
    const image = store.image("https://x.test/a", "");
    loader.images[0].resolve(loadedImage(10));
    await image;
    expect(store.peekText("https://x.test/a")).toBeUndefined();
    void store.text("https://x.test/a", "");
    expect(loader.texts).toHaveLength(2);
  });
});

describe("shared session cache (epic §5: the comparison cache, 50 MB LRU)", () => {
  it("evicts least recently used files across previews and comparison originals", async () => {
    const loader = new FakePreviewFileLoader();
    const generator = new FakeVariantGenerator();
    const cache = createSessionFileCache(1_000);
    const previews = createPreviewFileStore(loader, { cache });
    const variants = createImageVariantStore(generator, { cache });

    const original = variants.original("https://x.test/a.jpg", "image/jpeg");
    generator.loads[0].resolve(loadedFile(600));
    await original;
    expect(cache.totalBytes()).toBe(600);

    const gif = previews.image(GIF, "image/gif");
    loader.images[0].resolve(loadedImage(600));
    await gif;
    expect(cache.totalBytes()).toBe(600);
    expect(variants.peekOriginal("https://x.test/a.jpg")).toBeUndefined();
    expect(previews.peekImage(GIF)).toBeDefined();
  });

  it("does not cache a file larger than the cache, but returns it", async () => {
    const { loader, store } = setup(100);
    const p = store.image(GIF, "");
    loader.images[0].resolve(loadedImage(500));
    expect((await p).status).toBe("loaded");
    expect(store.peekImage(GIF)).toBeUndefined();
  });

  it("defaults to its own cache of COMPARISON_CACHE_MAX_BYTES", async () => {
    const loader = new FakePreviewFileLoader();
    const store = createPreviewFileStore(loader);
    const p = store.image(GIF, "");
    loader.images[0].resolve(loadedImage(10));
    await p;
    expect(store.peekImage(GIF)).toBeDefined();
  });
});
