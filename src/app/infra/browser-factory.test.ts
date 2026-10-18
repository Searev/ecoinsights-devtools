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
