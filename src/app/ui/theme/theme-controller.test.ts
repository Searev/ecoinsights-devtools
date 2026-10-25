import { describe, expect, it } from "vitest";
import { createThemeController } from "./theme-controller";
import {
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  ThemeStorage,
} from "./theme-types";

type QueryListener = (event: { matches: boolean }) => void;
type StorageListener = (event: { key: string | null; newValue: string | null }) => void;

function fakeQuery(matches: boolean) {
  const listeners: QueryListener[] = [];
  const query = {
    matches,
    addEventListener: (_t: "change", l: QueryListener) => listeners.push(l),
    removeEventListener: (_t: "change", l: QueryListener) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  return {
    query,
    listeners,
    change(next: boolean) {
      query.matches = next;
      [...listeners].forEach((l) => l({ matches: next }));
    },
  };
}

function fakeEvents() {
  const listeners: StorageListener[] = [];
  return {
    events: {
      addEventListener: (_t: "storage", l: StorageListener) => listeners.push(l),
      removeEventListener: (_t: "storage", l: StorageListener) => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      },
    },
    listeners,
    fire: (key: string | null, newValue: string | null) => listeners.forEach((l) => l({ key, newValue })),
  };
}

function fakeStorage(initial?: string) {
  const writes: Array<[string, string]> = [];
  const storage: ThemeStorage = {
    getItem: (k) => (k === THEME_STORAGE_KEY && initial !== undefined ? initial : null),
    setItem: (k, v) => {
      writes.push([k, v]);
    },
  };
  return { storage, writes };
}

function fakeRoot() {
  const attrs: Record<string, string> = {};
  return { root: { setAttribute: (n: string, v: string) => (attrs[n] = v) }, attrs };
}

describe("createThemeController", () => {
  it("starts from the stored mode and applies the attribute at creation", () => {
    const { root, attrs } = fakeRoot();
    const c = createThemeController({
      storage: fakeStorage("light").storage,
      query: fakeQuery(false).query,
      root,
    });
    expect(c.state()).toEqual({ mode: "light", resolved: "light" });
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
  });

  it("resolves system against the query", () => {
    const { root, attrs } = fakeRoot();
    const c = createThemeController({ query: fakeQuery(true).query, root });
    expect(c.state()).toEqual({ mode: "system", resolved: "light" });
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
  });

  it("works without any dependency and resolves system to dark", () => {
    const c = createThemeController({});
    expect(c.state()).toEqual({ mode: "system", resolved: "dark" });
    c.setMode("light");
    expect(c.state()).toEqual({ mode: "light", resolved: "light" });
    c.dispose();
  });

  it("setMode writes, applies and notifies; the same mode twice notifies once", () => {
    const { root, attrs } = fakeRoot();
    const s = fakeStorage();
    const c = createThemeController({ storage: s.storage, query: fakeQuery(false).query, root });
    const seen: unknown[] = [];
    c.subscribe((st) => seen.push(st));
    c.setMode("light");
    c.setMode("light");
    expect(s.writes).toEqual([[THEME_STORAGE_KEY, "light"]]);
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
    expect(seen).toEqual([{ mode: "light", resolved: "light" }]);
  });

  it("keeps the mode for the session when storage throws", () => {
    const { root, attrs } = fakeRoot();
    const storage: ThemeStorage = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
    };
    const c = createThemeController({ storage, query: fakeQuery(false).query, root });
    expect(() => c.setMode("light")).not.toThrow();
    expect(c.state().mode).toBe("light");
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
  });

  it("re-resolves a query change in system mode only", () => {
    const { root, attrs } = fakeRoot();
    const q = fakeQuery(false);
    const c = createThemeController({ query: q.query, root });
    const seen: unknown[] = [];
    c.subscribe((st) => seen.push(st));
    q.change(true);
    expect(c.state().resolved).toBe("light");
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
    expect(seen).toHaveLength(1);

    c.setMode("dark");
    seen.length = 0;
    q.change(false);
    q.change(true);
    expect(c.state()).toEqual({ mode: "dark", resolved: "dark" });
    expect(seen).toHaveLength(0);
  });

  it("back to system resolves against the current query", () => {
    const q = fakeQuery(false);
    const c = createThemeController({ query: q.query });
    c.setMode("dark");
    q.change(true);
    c.setMode("system");
    expect(c.state()).toEqual({ mode: "system", resolved: "light" });
  });

  it("adopts a storage event without writing back", () => {
    const e = fakeEvents();
    const s = fakeStorage();
    const { root, attrs } = fakeRoot();
    const c = createThemeController({ storage: s.storage, query: fakeQuery(false).query, root, events: e.events });
    const seen: unknown[] = [];
    c.subscribe((st) => seen.push(st));
    e.fire(THEME_STORAGE_KEY, "light");
    expect(c.state()).toEqual({ mode: "light", resolved: "light" });
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
    expect(seen).toHaveLength(1);
    expect(s.writes).toEqual([]);
  });

  it.each([null, "blue"])("storage event with newValue %j gives system", (value) => {
    const e = fakeEvents();
    const c = createThemeController({ query: fakeQuery(false).query, events: e.events });
    c.setMode("light");
    e.fire(THEME_STORAGE_KEY, value);
    expect(c.state()).toEqual({ mode: "system", resolved: "dark" });
  });

  it("storage cleared (key null) gives system; other keys are ignored", () => {
    const e = fakeEvents();
    const c = createThemeController({ query: fakeQuery(false).query, events: e.events });
    c.setMode("light");
    e.fire("other", "dark");
    expect(c.state().mode).toBe("light");
    e.fire(null, null);
    expect(c.state().mode).toBe("system");
  });

  it("subscribe returns an unsubscribe", () => {
    const c = createThemeController({});
    const seen: unknown[] = [];
    const off = c.subscribe((st) => seen.push(st));
    off();
    c.setMode("light");
    expect(seen).toEqual([]);
  });

  it("dispose removes the query and storage listeners", () => {
    const q = fakeQuery(false);
    const e = fakeEvents();
    const c = createThemeController({ query: q.query, events: e.events });
    expect(q.listeners).toHaveLength(1);
    expect(e.listeners).toHaveLength(1);
    c.dispose();
    expect(q.listeners).toHaveLength(0);
    expect(e.listeners).toHaveLength(0);
  });
});
