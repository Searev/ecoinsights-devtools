import { fileURLToPath } from "node:url";
const HERE = fileURLToPath(new URL(".", import.meta.url));
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { mergeManifest, readManifest } from "./manifest.mjs";

const root = resolve(HERE, "..");
const forbidden = ["content_scripts"];

describe("mergeManifest", () => {
  it("merges nested objects, replaces arrays and does not mutate the base", () => {
    const base = { a: { b: 1, c: [1, 2] }, d: "x" };
    const snapshot = JSON.parse(JSON.stringify(base));
    const out = mergeManifest(base, { a: { c: [3], e: 2 }, d: "y" });
    expect(out).toEqual({ a: { b: 1, c: [3], e: 2 }, d: "y" });
    expect(base).toEqual(snapshot);
  });
});

describe("merged manifests", () => {
  const chrome = readManifest("chrome");
  const firefox = readManifest("firefox");

  it("chrome uses a service worker, firefox uses background scripts and a gecko id", () => {
    expect(chrome.background.service_worker).toBe("scripts/background.js");
    expect(chrome.background.scripts).toBeUndefined();
    expect(firefox.background.scripts).toEqual(["scripts/background.js"]);
    expect(firefox.background.service_worker).toBeUndefined();
    expect(firefox.browser_specific_settings.gecko.id).toBe("bastienhub@gmail.com");
    expect(firefox.browser_specific_settings.gecko.strict_min_version).toBe("109.0");
  });

  it.each([["chrome", chrome], ["firefox", firefox]])("%s has no dropped keys or permissions", (_n, m) => {
    for (const k of forbidden) expect(m[k]).toBeUndefined();
    expect(m.permissions).toEqual(["scripting", "tabs", "browsingData"]);
    expect(m.host_permissions).toEqual(["<all_urls>"]);
    expect(m.manifest_version).toBe(3);
  });

  it.each([["chrome", chrome], ["firefox", firefox]])("%s references only produced files", (_n, m) => {
    expect(m.devtools_page).toBe("devtools.html");
    expect(existsSync(resolve(root, "src", m.devtools_page))).toBe(true);
    for (const icon of Object.values(m.icons)) {
      expect(existsSync(resolve(root, "src/public", icon))).toBe(true);
    }
  });

  it.each([["chrome", chrome], ["firefox", firefox]])("%s allows WebAssembly in extension pages", (_n, m) => {
    expect(m.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    });
  });

  it.each([["chrome", chrome], ["firefox", firefox]])(
    "%s sets no img-src or default-src, so blob: images of the comparison dialog are allowed",
    (_n, m) => {
      const directives = m.content_security_policy.extension_pages
        .split(";")
        .map((d) => d.trim().split(/\s+/)[0]);
      expect(directives).not.toContain("img-src");
      expect(directives).not.toContain("default-src");
    },
  );

  it.each([["chrome", chrome], ["firefox", firefox]])(
    "%s sets no media-src or font-src, so the previews can stream remote media and load fonts from bytes (ARCH-DECISION-023)",
    (_n, m) => {
      const directives = m.content_security_policy.extension_pages
        .split(";")
        .map((d) => d.trim().split(/\s+/)[0]);
      expect(directives).not.toContain("media-src");
      expect(directives).not.toContain("font-src");
      expect(directives).not.toContain("connect-src");
    },
  );

  it("chrome requires Chrome 103 (wasm-unsafe-eval)", () => {
    expect(chrome.minimum_chrome_version).toBe("103");
  });
});
