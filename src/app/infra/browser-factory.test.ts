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
});
