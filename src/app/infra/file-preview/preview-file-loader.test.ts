import { describe, expect, it, vi } from "vitest";
import { createPreviewFileLoader } from "./preview-file-loader";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0x2c, 0, 0, 0, 0xc8, 0, 0, 0, 0, 0,
]);
const WOFF2 = Uint8Array.from([0x77, 0x4f, 0x46, 0x32, ...new Array(60).fill(7)]);
const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const URL_ = "https://a.test/file";

function streamOf(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

function setup(opts: {
  devtools?: { content: string; encoding?: string } | null | Error;
  response?: Response | Error;
  maxBytes?: number;
  noDevtools?: boolean;
} = {}) {
  const getDevtoolsContent = vi.fn(async () => {
    if (opts.devtools instanceof Error) throw opts.devtools;
    return opts.devtools ?? null;
  });
  const fetch = vi.fn(async () => {
    if (opts.response instanceof Error) throw opts.response;
    return opts.response ?? new Response(null, { status: 404 });
  });
  const loader = createPreviewFileLoader({
    getDevtoolsContent: opts.noDevtools ? undefined : getDevtoolsContent,
    fetch,
    maxBytes: opts.maxBytes,
  });
  return { loader, getDevtoolsContent, fetch };
}

describe("createPreviewFileLoader", () => {
  describe("DevTools content", () => {
    it("decodes a base64 image and does not fetch", async () => {
      const { loader, fetch, getDevtoolsContent } = setup({ devtools: { content: toBase64(PNG), encoding: "base64" } });
      const r = await loader.loadImage(URL_, "image/png");
      expect(getDevtoolsContent).toHaveBeenCalledWith(URL_);
      expect(fetch).not.toHaveBeenCalled();
      expect(r).toMatchObject({ status: "loaded", info: { format: "png", width: 300, height: 200, byteLength: PNG.length, mimeType: "image/png" } });
      if (r.status === "loaded") expect(Array.from(r.bytes)).toEqual(Array.from(PNG));
    });

    it("decodes a base64 font and uses the declared type", async () => {
      const { loader, fetch } = setup({ devtools: { content: toBase64(WOFF2), encoding: "base64" } });
      const r = await loader.loadFont(URL_, "font/woff2");
      expect(fetch).not.toHaveBeenCalled();
      expect(r).toMatchObject({ status: "loaded", info: { format: "woff2", byteLength: WOFF2.length, mimeType: "font/woff2" } });
    });

    it("accepts base64 without encoding (Firefox) when the signature is known", async () => {
      const { loader, fetch } = setup({ devtools: { content: toBase64(PNG) } });
      expect((await loader.loadImage(URL_, "")).status).toBe("loaded");
      expect(fetch).not.toHaveBeenCalled();
      const f = setup({ devtools: { content: toBase64(WOFF2) } });
      expect((await f.loader.loadFont(URL_, "")).status).toBe("loaded");
      expect(f.fetch).not.toHaveBeenCalled();
    });

    it("uses SVG text content as UTF-8 bytes", async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"><title>é</title></svg>';
      const { loader, fetch } = setup({ devtools: { content: svg } });
      const r = await loader.loadImage(URL_, "image/svg+xml");
      expect(fetch).not.toHaveBeenCalled();
      expect(r).toMatchObject({ status: "loaded", info: { format: "svg", width: 10, height: 5, byteLength: new TextEncoder().encode(svg).length } });
    });

    it("falls through to fetch for text content on a font", async () => {
      const { loader, fetch } = setup({
        devtools: { content: "<svg></svg>" },
        response: new Response(WOFF2, { status: 200, headers: { "content-type": "font/woff2" } }),
      });
      expect((await loader.loadFont(URL_, "")).status).toBe("loaded");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("falls through to fetch on invalid base64", async () => {
      const { loader, fetch } = setup({
        devtools: { content: "!!!not base64!!!", encoding: "base64" },
        response: new Response(PNG, { status: 200 }),
      });
      expect((await loader.loadImage(URL_, "image/png")).status).toBe("loaded");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("refuses base64 over the cap without decoding or fetching", async () => {
      const atobSpy = vi.spyOn(globalThis, "atob");
      const content = "A".repeat(400); // 300 bytes
      const { loader, fetch } = setup({ devtools: { content, encoding: "base64" }, maxBytes: 100 });
      expect(await loader.loadImage(URL_, "image/png")).toEqual({ status: "error", error: "too-large" });
      expect(atobSpy).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      atobSpy.mockRestore();
    });

    it("accounts for base64 padding in the size check", async () => {
      // 8 chars with "==" = 4 bytes
      const { loader } = setup({ devtools: { content: toBase64(PNG), encoding: "base64" }, maxBytes: PNG.length });
      expect((await loader.loadImage(URL_, "")).status).toBe("loaded");
      const over = setup({ devtools: { content: toBase64(PNG), encoding: "base64" }, maxBytes: PNG.length - 1 });
      expect(await over.loader.loadImage(URL_, "")).toEqual({ status: "error", error: "too-large" });
    });

    it("refuses SVG text over the cap", async () => {
      const { loader } = setup({ devtools: { content: `<svg>${"x".repeat(200)}</svg>` }, maxBytes: 50 });
      expect(await loader.loadImage(URL_, "image/svg+xml")).toEqual({ status: "error", error: "too-large" });
    });

    it("fetches when getDevtoolsContent throws, returns null, or is absent", async () => {
      for (const o of [{ devtools: new Error("boom") }, { devtools: null }, { noDevtools: true }]) {
        const { loader, fetch } = setup({ ...o, response: new Response(PNG, { status: 200 }) });
        expect((await loader.loadImage(URL_, "image/png")).status).toBe("loaded");
        expect(fetch).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe("fetch", () => {
    it("re-downloads cache-first with credentials", async () => {
      const { loader, fetch } = setup({ response: new Response(PNG, { status: 200 }) });
      await loader.loadImage(URL_, "image/png");
      expect(fetch).toHaveBeenCalledWith(URL_, { cache: "force-cache", credentials: "include" });
    });

    it("reports HTTP errors as unavailable", async () => {
      const { loader } = setup({ response: new Response(null, { status: 404 }) });
      expect(await loader.loadImage(URL_, "image/png")).toEqual({ status: "error", error: "unavailable", message: "HTTP 404" });
    });

    it("reports network errors as unavailable", async () => {
      const { loader } = setup({ response: new Error("offline") });
      expect(await loader.loadFont(URL_, "")).toEqual({ status: "error", error: "unavailable", message: "offline" });
    });

    it("refuses a content-length over the cap without reading the body", async () => {
      const cancel = vi.fn();
      const response = new Response(streamOf([PNG], cancel), { status: 200, headers: { "content-length": "5000" } });
      const { loader } = setup({ response, maxBytes: 1000 });
      expect(await loader.loadImage(URL_, "image/png")).toEqual({ status: "error", error: "too-large" });
      await new Promise((r) => setTimeout(r, 0));
      expect(cancel).toHaveBeenCalled();
    });

    it("cancels a streamed body that exceeds the cap without content-length", async () => {
      const cancel = vi.fn();
      const chunk = new Uint8Array(60);
      const response = new Response(streamOf([chunk, chunk, chunk], cancel), { status: 200 });
      const { loader } = setup({ response, maxBytes: 100 });
      expect(await loader.loadImage(URL_, "image/png")).toEqual({ status: "error", error: "too-large" });
      expect(cancel).toHaveBeenCalled();
    });

    it("accumulates chunks of a body within the cap", async () => {
      const response = new Response(streamOf([PNG.subarray(0, 10), PNG.subarray(10)]), { status: 200 });
      const { loader } = setup({ response });
      const r = await loader.loadImage(URL_, "image/png");
      expect(r.status).toBe("loaded");
      if (r.status === "loaded") expect(Array.from(r.bytes)).toEqual(Array.from(PNG));
    });

    it("uses arrayBuffer() when the response has no body stream", async () => {
      const fake = { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => PNG.slice().buffer } as unknown as Response;
      const { loader } = setup({ response: fake });
      expect((await loader.loadImage(URL_, "image/png")).status).toBe("loaded");
      const big = { ...fake, arrayBuffer: async () => new ArrayBuffer(500) } as unknown as Response;
      expect(await setup({ response: big, maxBytes: 100 }).loader.loadImage(URL_, "image/png")).toEqual({ status: "error", error: "too-large" });
    });

    it("prefers the response content-type, without parameters, over the declared type", async () => {
      const response = new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "Image/WebP; charset=binary" } });
      const r = await setup({ response }).loader.loadImage(URL_, "image/png");
      expect(r).toMatchObject({ status: "loaded", info: { format: "webp", mimeType: "image/webp" } });
    });

    it("falls back to the declared type when there is no content-type", async () => {
      const r = await setup({ response: new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }) }).loader.loadImage(URL_, "image/avif");
      expect(r).toMatchObject({ status: "loaded", info: { format: "avif", mimeType: "image/avif" } });
    });
  });

  describe("kind checks", () => {
    it("reports bytes that are not an image as unavailable", async () => {
      const response = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
      const r = await setup({ response }).loader.loadImage(URL_, "image/png");
      expect(r).toMatchObject({ status: "error", error: "unavailable" });
    });

    it("accepts any bytes for a font, with format unknown", async () => {
      const response = new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "text/plain" } });
      const r = await setup({ response }).loader.loadFont("https://a.test/x", "");
      expect(r).toMatchObject({ status: "loaded", info: { format: "unknown", byteLength: 3, mimeType: "text/plain" } });
    });
  });

  it("never rejects", async () => {
    const throwing = createPreviewFileLoader({
      getDevtoolsContent: () => {
        throw new Error("sync boom");
      },
      fetch: () => {
        throw new Error("sync fetch boom");
      },
    });
    expect(await throwing.loadImage(URL_, "")).toMatchObject({ status: "error", error: "unavailable" });
    expect(await throwing.loadFont(URL_, "")).toMatchObject({ status: "error", error: "unavailable" });
  });
});
