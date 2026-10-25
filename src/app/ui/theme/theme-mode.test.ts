import { describe, expect, it } from "vitest";
import {
  applyResolvedTheme,
  parseThemeMode,
  readStoredMode,
  resolveTheme,
  safeStorage,
  writeStoredMode,
} from "./theme-mode";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY, ThemeStorage } from "./theme-types";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  const reads: string[] = [];
  const storage: ThemeStorage = {
    getItem: (k) => {
      reads.push(k);
      return k in data ? data[k] : null;
    },
    setItem: (k, v) => {
      data[k] = v;
    },
  };
  return { storage, data, reads };
}

const throwing: ThemeStorage = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("parseThemeMode", () => {
  it("keeps the three modes", () => {
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
  });
  it.each([null, undefined, "", "blue", "Light", 1, {}, []])("maps %j to system", (v) => {
    expect(parseThemeMode(v)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it.each([
    ["system", true, "light"],
    ["system", false, "dark"],
    ["light", true, "light"],
    ["light", false, "light"],
    ["dark", true, "dark"],
    ["dark", false, "dark"],
  ] as const)("%s with prefersLight=%s gives %s", (mode, prefers, expected) => {
    expect(resolveTheme(mode, prefers)).toBe(expected);
  });
});

describe("readStoredMode", () => {
  it("defaults to system without storage", () => {
    expect(readStoredMode(undefined)).toBe("system");
  });
  it("defaults to system when getItem throws", () => {
    expect(readStoredMode(throwing)).toBe("system");
  });
  it("ignores an invalid stored value", () => {
    expect(readStoredMode(fakeStorage({ [THEME_STORAGE_KEY]: "blue" }).storage)).toBe("system");
  });
  it("reads the stored mode from the theme key only", () => {
    const f = fakeStorage({ [THEME_STORAGE_KEY]: "light" });
    expect(readStoredMode(f.storage)).toBe("light");
    expect(f.reads).toEqual([THEME_STORAGE_KEY]);
  });
});

describe("writeStoredMode", () => {
  it("writes the key and returns true", () => {
    const f = fakeStorage();
    expect(writeStoredMode(f.storage, "dark")).toBe(true);
    expect(f.data[THEME_STORAGE_KEY]).toBe("dark");
  });
  it("returns false without throwing when setItem throws or storage is missing", () => {
    expect(writeStoredMode(throwing, "dark")).toBe(false);
    expect(writeStoredMode(undefined, "dark")).toBe(false);
  });
});

describe("safeStorage", () => {
  it("returns undefined when the getter throws or returns null", () => {
    expect(
      safeStorage(() => {
        throw new Error("blocked");
      }),
    ).toBeUndefined();
    expect(safeStorage(() => null)).toBeUndefined();
  });
  it("returns the storage otherwise", () => {
    const { storage } = fakeStorage();
    expect(safeStorage(() => storage)).toBe(storage);
  });
});

describe("applyResolvedTheme", () => {
  it("sets data-theme", () => {
    const calls: Array<[string, string]> = [];
    applyResolvedTheme({ setAttribute: (n, v) => calls.push([n, v]) }, "light");
    expect(calls).toEqual([[THEME_ATTRIBUTE, "light"]]);
  });
});
