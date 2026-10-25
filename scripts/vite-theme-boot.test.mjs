import { describe, expect, it, vi } from "vitest";
import vm from "node:vm";
import { buildThemeBoot, themeBootPlugin } from "./vite-theme-boot.mjs";

const ENTRY = "src/app/ui/theme/theme-boot.entry.ts";

function runBoot(code, { stored, throwingStorage = false, prefersLight = false } = {}) {
  const attrs = {};
  const window = {
    matchMedia: () => ({ matches: prefersLight }),
    document: { documentElement: { setAttribute: (n, v) => (attrs[n] = v) } },
  };
  if (throwingStorage) {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
  } else {
    window.localStorage = { getItem: () => stored ?? null, setItem() {} };
  }
  const context = vm.createContext({ window });
  vm.runInContext(code, context);
  return attrs;
}

describe("buildThemeBoot", () => {
  it("returns a small classic script without import or export", async () => {
    const code = await buildThemeBoot(ENTRY);
    expect(code).not.toMatch(/\bimport\b\s*[\w{*"']/);
    expect(code).not.toMatch(/\bexport\b\s*[\w{*]/);
    expect(Buffer.byteLength(code)).toBeLessThan(2048);
  });

  it("sets data-theme from the stored mode", async () => {
    const code = await buildThemeBoot(ENTRY);
    expect(runBoot(code, { stored: "light" })["data-theme"]).toBe("light");
    expect(runBoot(code, { stored: "dark", prefersLight: true })["data-theme"]).toBe("dark");
  });

  it("survives a throwing storage", async () => {
    const code = await buildThemeBoot(ENTRY);
    expect(runBoot(code, { throwingStorage: true, prefersLight: true })["data-theme"]).toBe("light");
    expect(runBoot(code, { throwingStorage: true })["data-theme"]).toBe("dark");
  });
});

describe("themeBootPlugin", () => {
  const plugin = () => themeBootPlugin({ entry: ENTRY });

  it("has a name", () => {
    expect(plugin().name).toBeTruthy();
  });

  it("injects a classic script in the head of index.html only, after Vite's own processing", () => {
    const hook = plugin().transformIndexHtml;
    expect(hook.order).toBe("post");
    const tags = hook.handler("<html></html>", { path: "/index.html", filename: "/repo/src/index.html" });
    expect(tags).toEqual([{ tag: "script", attrs: { src: "./theme-boot.js" }, injectTo: "head-prepend" }]);
    expect(tags[0].attrs.type).toBeUndefined();
  });

  it("injects for a filename-only context and nothing for devtools.html", () => {
    const { handler } = plugin().transformIndexHtml;
    expect(handler("", { filename: "/repo/src/index.html" })).toHaveLength(1);
    expect(handler("", { path: "/devtools.html", filename: "/repo/src/devtools.html" })).toBeUndefined();
    expect(handler("", { path: "/devtools.html" })).toBeUndefined();
  });

  it("emits the built code as an asset", async () => {
    const p = plugin();
    const emitFile = vi.fn();
    await p.generateBundle.call({ emitFile }, {}, {});
    const code = await buildThemeBoot(ENTRY);
    expect(emitFile).toHaveBeenCalledWith({ type: "asset", fileName: "theme-boot.js", source: code });
  });

  it("serves /theme-boot.js in dev, with or without a query string, and passes other URLs on", async () => {
    const p = plugin();
    let middleware;
    p.configureServer({ middlewares: { use: (fn) => (middleware = fn) } });
    const code = await buildThemeBoot(ENTRY);

    for (const url of ["/theme-boot.js", "/theme-boot.js?t=1"]) {
      const headers = {};
      let body;
      const next = vi.fn();
      await middleware(
        { url },
        { setHeader: (k, v) => (headers[k] = v), end: (b) => (body = b) },
        next,
      );
      expect(headers["Content-Type"]).toBe("text/javascript");
      expect(body).toBe(code);
      expect(next).not.toHaveBeenCalled();
    }

    const next = vi.fn();
    await middleware({ url: "/index.html" }, { setHeader() {}, end() {} }, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("honours custom file names", () => {
    const p = themeBootPlugin({ entry: ENTRY, fileName: "boot.js", htmlFile: "panel.html" });
    const { handler } = p.transformIndexHtml;
    expect(handler("", { path: "/panel.html" })).toEqual([
      { tag: "script", attrs: { src: "./boot.js" }, injectTo: "head-prepend" },
    ]);
    expect(handler("", { path: "/index.html" })).toBeUndefined();
  });
});
