import { describe, expect, it, vi } from "vitest";
import { ExtensionBrowser } from "./extension-browser";
import { getBrowser } from "./browser-factory";

describe("getBrowser", () => {
  it("returns a memoised ExtensionBrowser when chrome.devtools.inspectedWindow exists", async () => {
    vi.stubGlobal("chrome", {
      runtime: { connect: () => ({}) },
      devtools: { inspectedWindow: { tabId: 1 }, network: {} },
    });
    const first = await getBrowser();
    expect(first).toBeInstanceOf(ExtensionBrowser);
    expect(await getBrowser()).toBe(first);
  });
});

describe("getImageEstimator", () => {
  it("returns a memoised FakeImageEstimator outside the extension", async () => {
    // Runs in a fresh module graph so that no ExtensionBrowser was memoised by another test.
    vi.resetModules();
    vi.stubGlobal("chrome", undefined);
    const factory = await import("./browser-factory");
    const { FakeImageEstimator: Fake } = await import("./image-estimator/fake-image-estimator");
    const first = await factory.getImageEstimator();
    expect(first).toBeInstanceOf(Fake);
    expect(await factory.getImageEstimator()).toBe(first);
  });

  it("also implements the variant generator port outside the extension", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", undefined);
    const factory = await import("./browser-factory");
    const estimator = await factory.getImageEstimator();
    expect(typeof estimator.estimate).toBe("function");
    expect(typeof estimator.loadOriginal).toBe("function");
    expect(typeof estimator.generate).toBe("function");
  });
});

describe("getContentAnalyser", () => {
  it("returns a memoised FakeContentAnalyser outside the extension", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", undefined);
    const factory = await import("./browser-factory");
    const { FakeContentAnalyser } = await import("./content-analyser/fake-content-analyser");
    const first = await factory.getContentAnalyser();
    expect(first).toBeInstanceOf(FakeContentAnalyser);
    expect(await factory.getContentAnalyser()).toBe(first);
  });

  it("returns a memoised DevTools analyser on the ExtensionBrowser in the extension", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: { connect: () => ({}) },
      devtools: { inspectedWindow: { tabId: 1 }, network: {} },
    });
    const factory = await import("./browser-factory");
    const { FakeContentAnalyser } = await import("./content-analyser/fake-content-analyser");
    const analyser = await factory.getContentAnalyser();
    expect(analyser).not.toBeInstanceOf(FakeContentAnalyser);
    expect(typeof analyser.analyse).toBe("function");
    expect(typeof analyser.cancel).toBe("function");
    expect(await factory.getContentAnalyser()).toBe(analyser);
    // Nothing captured for an unknown URL: not evaluated, and no network involved.
    expect(await analyser.analyse({ url: "https://example.org/a.js", type: "JS" })).toEqual({
      status: "not-evaluated",
      reason: "content-unavailable",
    });
  });
});

describe("getPreviewFileLoader", () => {
  it("returns a memoised FakePreviewFileLoader outside the extension", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", undefined);
    const factory = await import("./browser-factory");
    const { FakePreviewFileLoader } = await import("./file-preview/fake-preview-file-loader");
    const first = await factory.getPreviewFileLoader();
    expect(first).toBeInstanceOf(FakePreviewFileLoader);
    expect(await factory.getPreviewFileLoader()).toBe(first);
  });

  it("returns a memoised real loader in the extension", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: { connect: () => ({}) },
      devtools: { inspectedWindow: { tabId: 1 }, network: {} },
    });
    const factory = await import("./browser-factory");
    const { FakePreviewFileLoader } = await import("./file-preview/fake-preview-file-loader");
    const loader = await factory.getPreviewFileLoader();
    expect(loader).not.toBeInstanceOf(FakePreviewFileLoader);
    expect(typeof loader.loadImage).toBe("function");
    expect(typeof loader.loadFont).toBe("function");
    expect(await factory.getPreviewFileLoader()).toBe(loader);
  });
});
