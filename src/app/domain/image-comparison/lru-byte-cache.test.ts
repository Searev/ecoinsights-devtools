import { describe, expect, it } from "vitest";
import { createLruByteCache } from "./lru-byte-cache";

const sizeOf = (v: { n: number }) => v.n;
const make = (max: number) => createLruByteCache<{ n: number }>(max, sizeOf);

describe("createLruByteCache", () => {
  it("stores and reads values and tracks the total", () => {
    const c = make(100);
    c.set("a", { n: 30 });
    c.set("b", { n: 20 });
    expect(c.get("a")).toEqual({ n: 30 });
    expect(c.has("b")).toBe(true);
    expect(c.has("z")).toBe(false);
    expect(c.get("z")).toBeUndefined();
    expect(c.totalBytes()).toBe(50);
  });

  it("evicts the least recently used entries first until the total fits", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.set("b", { n: 40 });
    c.set("c", { n: 40 });
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
    expect(c.has("c")).toBe(true);
    expect(c.totalBytes()).toBe(80);
    c.set("d", { n: 90 });
    expect([c.has("b"), c.has("c"), c.has("d")]).toEqual([false, false, true]);
    expect(c.totalBytes()).toBe(90);
  });

  it("refreshes the position on get", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.set("b", { n: 40 });
    c.get("a");
    c.set("c", { n: 40 });
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
  });

  it("has() does not refresh the position", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.set("b", { n: 40 });
    c.has("a");
    c.set("c", { n: 40 });
    expect(c.has("a")).toBe(false);
  });

  it("does not store a value larger than the cap and keeps the others", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.set("big", { n: 101 });
    expect(c.has("big")).toBe(false);
    expect(c.has("a")).toBe(true);
    expect(c.totalBytes()).toBe(40);
  });

  it("drops the previous value of a key when an oversized value overwrites it", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.set("a", { n: 500 });
    expect(c.has("a")).toBe(false);
    expect(c.totalBytes()).toBe(0);
  });

  it("stores a value exactly at the cap", () => {
    const c = make(100);
    c.set("a", { n: 100 });
    expect(c.has("a")).toBe(true);
  });

  it("overwrites a key: the total follows and the key becomes the most recent", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.set("b", { n: 40 });
    c.set("a", { n: 10 });
    expect(c.totalBytes()).toBe(50);
    c.set("c", { n: 60 });
    expect(c.has("b")).toBe(false);
    expect(c.has("a")).toBe(true);
    expect(c.totalBytes()).toBe(70);
  });

  it("deletes entries and ignores unknown keys", () => {
    const c = make(100);
    c.set("a", { n: 40 });
    c.delete("a");
    c.delete("nope");
    expect(c.has("a")).toBe(false);
    expect(c.totalBytes()).toBe(0);
  });
});
