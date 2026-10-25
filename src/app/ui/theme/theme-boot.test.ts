import { describe, expect, it } from "vitest";
import { bootTheme, ThemeBootEnv } from "./theme-boot";
import { LIGHT_SCHEME_QUERY, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "./theme-types";

function setup(opts: {
  stored?: string;
  matchMedia?: ThemeBootEnv["matchMedia"];
  throwingStorage?: boolean;
}) {
  const attrs: Record<string, string> = {};
  const env: ThemeBootEnv = {
    matchMedia: opts.matchMedia,
    document: { documentElement: { setAttribute: (n, v) => (attrs[n] = v) } },
  };
  if (opts.throwingStorage) {
    Object.defineProperty(env, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
  } else {
    env.localStorage = {
      getItem: (k: string) => (k === THEME_STORAGE_KEY && opts.stored !== undefined ? opts.stored : null),
      setItem: () => undefined,
    };
  }
  return { env, attrs };
}

const dark = () => ({ matches: false });
const light = () => ({ matches: true });

describe("bootTheme", () => {
  it("applies the stored light mode even when the system is dark", () => {
    const { env, attrs } = setup({ stored: "light", matchMedia: dark });
    expect(bootTheme(env)).toBe("light");
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
  });

  it("applies the stored dark mode even when the system is light", () => {
    const { env, attrs } = setup({ stored: "dark", matchMedia: light });
    expect(bootTheme(env)).toBe("dark");
    expect(attrs[THEME_ATTRIBUTE]).toBe("dark");
  });

  it("follows matchMedia when nothing is stored", () => {
    const queries: string[] = [];
    const { env, attrs } = setup({
      matchMedia: (q) => {
        queries.push(q);
        return { matches: true };
      },
    });
    expect(bootTheme(env)).toBe("light");
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
    expect(queries).toEqual([LIGHT_SCHEME_QUERY]);
  });

  it("falls back when localStorage access throws", () => {
    const { env, attrs } = setup({ throwingStorage: true, matchMedia: light });
    expect(() => bootTheme(env)).not.toThrow();
    expect(attrs[THEME_ATTRIBUTE]).toBe("light");
  });

  it("falls back to dark without matchMedia", () => {
    const { env, attrs } = setup({ stored: "system" });
    expect(bootTheme(env)).toBe("dark");
    expect(attrs[THEME_ATTRIBUTE]).toBe("dark");
  });

  it("falls back to dark when matchMedia throws", () => {
    const { env } = setup({
      matchMedia: () => {
        throw new Error("nope");
      },
    });
    expect(bootTheme(env)).toBe("dark");
  });

  it("never throws, even when the document is unusable", () => {
    const env = {
      document: {
        documentElement: {
          setAttribute: () => {
            throw new Error("x");
          },
        },
      },
    } as ThemeBootEnv;
    expect(() => bootTheme(env)).not.toThrow();
    expect(bootTheme(env)).toBeUndefined();
  });
});
