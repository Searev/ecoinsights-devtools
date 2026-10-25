import { describe, expect, it } from "vitest";
import { THEME_BACKDROPS, THEME_TOKENS, hexToChannels, tokenVariable } from "./theme-tokens";
import { themeBaseStyles, tailwindThemeColours } from "./theme-styles";
import { THEME_TOKEN_NAMES } from "./theme-types";

type Block = Record<string, unknown>;

const LIGHT_MEDIA = "@media (prefers-color-scheme: light)";
const LIGHT_NOT_DARK = ':root:not([data-theme="dark"])';
const LIGHT_ATTR = ':root[data-theme="light"]';

function variables(theme: "dark" | "light"): Record<string, string> {
  return Object.fromEntries(THEME_TOKEN_NAMES.map((n) => [tokenVariable(n), hexToChannels(THEME_TOKENS[theme][n])]));
}

describe("tailwindThemeColours", () => {
  it("maps every token to an rgb() with alpha placeholder", () => {
    const colours = tailwindThemeColours();
    expect(Object.keys(colours).sort()).toEqual([...THEME_TOKEN_NAMES].sort());
    expect(colours.surfaceLight).toBe("rgb(var(--color-surface-light) / <alpha-value>)");
    for (const name of THEME_TOKEN_NAMES) {
      expect(colours[name]).toBe(`rgb(var(${tokenVariable(name)}) / <alpha-value>)`);
    }
  });
});

describe("themeBaseStyles", () => {
  const extra = {
    dark: { "--syntax-keyword": "#111111" },
    light: { "--syntax-keyword": "#222222" },
  };
  const styles = themeBaseStyles(extra) as Block;

  it("has exactly the five selectors of the contract", () => {
    expect(Object.keys(styles).sort()).toEqual(
      [":root", LIGHT_MEDIA, LIGHT_ATTR, "dialog::backdrop", `${LIGHT_ATTR} dialog::backdrop`].sort(),
    );
    expect(Object.keys(styles[LIGHT_MEDIA] as Block).sort()).toEqual(
      [LIGHT_NOT_DARK, `${LIGHT_NOT_DARK} dialog::backdrop`].sort(),
    );
  });

  it("emits the dark variables in channel form, extras and color-scheme on :root", () => {
    expect(styles[":root"]).toEqual({ ...variables("dark"), "--syntax-keyword": "#111111", "color-scheme": "dark" });
  });

  it("emits the light variables, extras and color-scheme on the attribute rule", () => {
    expect(styles[LIGHT_ATTR]).toEqual({ ...variables("light"), "--syntax-keyword": "#222222", "color-scheme": "light" });
  });

  it("uses the same light block in the media rule and the attribute rule", () => {
    const media = styles[LIGHT_MEDIA] as Block;
    expect(media[LIGHT_NOT_DARK]).toEqual(styles[LIGHT_ATTR]);
  });

  it("sets the backdrops per theme", () => {
    expect(styles["dialog::backdrop"]).toEqual({ "background-color": THEME_BACKDROPS.dark });
    expect(styles[`${LIGHT_ATTR} dialog::backdrop`]).toEqual({ "background-color": THEME_BACKDROPS.light });
    expect((styles[LIGHT_MEDIA] as Block)[`${LIGHT_NOT_DARK} dialog::backdrop`]).toEqual({
      "background-color": THEME_BACKDROPS.light,
    });
  });

  it("works without extra variables", () => {
    const plain = themeBaseStyles() as Block;
    expect(plain[":root"]).toEqual({ ...variables("dark"), "color-scheme": "dark" });
  });
});
