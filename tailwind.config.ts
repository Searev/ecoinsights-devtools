import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { tailwindThemeColours, themeBaseStyles } from "./src/app/ui/theme/theme-styles";
import { syntaxThemeVariables } from "./src/app/ui/analysis/preview/syntax/syntax-palette";

/**
 * US-030 (ARCH-DECISION-034): every colour is a theme token backed by a CSS custom property. The
 * values live in `src/app/ui/theme/theme-tokens.ts`; the base styles emit them per theme, switched by
 * `data-theme` on `<html>` (with a `prefers-color-scheme` fallback). Never use Tailwind's palette
 * (`white`, `gray-500`…) in components: `theme-sources.test.ts` fails on it.
 */
export default {
  content: ["./src/app/**/*.{js,jsx,ts,tsx,css}", "./src/index.html"],
  theme: {
    extend: {
      colors: {
        // Brand scale, kept unchanged; components use the semantic tokens below.
        primary: {
          50: "#dbe1f2",
          100: "#b7c3e5",
          200: "#92a5d7",
          300: "#8096d1",
          400: "#6e87ca",
          500: "#4a69bd",
          600: "#3b5497",
          700: "#344a84",
          800: "#2c3f71",
          900: "#1e2a4c",
        },
        ...tailwindThemeColours(),
      },
      // A bare `border` (form fields, alert boxes) draws the `field` token, 3:1 in both themes.
      borderColor: { DEFAULT: "rgb(var(--color-field) / <alpha-value>)" },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase(
        themeBaseStyles({ dark: syntaxThemeVariables("dark"), light: syntaxThemeVariables("light") }) as Parameters<
          typeof addBase
        >[0],
      );
    }),
  ],
} satisfies Config;
