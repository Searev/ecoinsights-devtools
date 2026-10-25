# ARCH-DECISION-034: Colour tokens defined once in TypeScript, emitted as CSS custom properties per theme, switched by `data-theme` on `<html>`

- **Status:** Accepted (US-030)
- **Builds on:** [ARCH-DECISION-025](ARCH-DECISION-025-text-viewer-in-house-tokenizer.md) (syntax palette as custom properties), [023](ARCH-DECISION-023-media-and-font-previews-csp.md) (CSP unchanged)
- **Companion:** [ARCH-DECISION-035](ARCH-DECISION-035-pre-paint-theme-boot-script.md) (pre-paint application)

## Context

US-030 adds a light theme next to today's dark one, with three modes (`Système`, `Clair`, `Sombre`). Every element must adapt, dark must look as before, and WCAG AA contrast must be **tested** on the colours of both themes. Today the colours live in four places: `tailwind.config.js`, hard-coded Tailwind palette classes (`text-white`, `bg-red-500`…), literals in CSS and SVG, and JavaScript (Chart.js defaults, the syntax palette, the EcoIndex grade colours).

Options considered:

1. **Tailwind `dark:` variants** (`darkMode: "class"`), doubling every colour class. Rejected: hundreds of paired classes, easy to forget one, and the colour values stay scattered in markup where no test can check their contrast.
2. **Two hand-written CSS files of custom properties**, plus the same values again in TypeScript for the contrast tests and Chart.js. Rejected: two sources of truth that drift.
3. **Tokens in TypeScript, emitted to CSS at build time (chosen).**

## Decision

- **One source of truth:** `src/app/ui/theme/theme-tokens.ts` holds `THEME_TOKENS: Record<"dark" | "light", Record<ThemeTokenName, "#rrggbb">>`. The token names (`theme-types.ts`) are semantic (`surface`, `strong`, `focus`, `dangerStrong`, `complianceA`, `chartLine`…), and keep today's Tailwind names (`background`, `surface`, `onsurface`, `surfaceLight`, `border`, `btn`, `onBtn`, `tableEven`, `tableOdd`) so existing classes keep working.
- **CSS custom properties:** `tailwind.config.ts` (TypeScript, loaded by Tailwind's jiti) imports the token modules and:
  - maps each Tailwind colour to `rgb(var(--color-<kebab-name>) / <alpha-value>)`, so opacity modifiers keep working;
  - sets `borderColor.DEFAULT` to the `field` token, so fields and alert boxes drawn with a bare `border` get a 3:1 boundary in light;
  - adds, through a plugin's `addBase`, the output of the pure `themeBaseStyles()`:
    - `:root` holds the dark variables and `color-scheme: dark`, the default;
    - `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }` holds the light ones, so `Système` works even without JavaScript;
    - `:root[data-theme="light"]` holds the light ones for the forced or resolved light theme;
    - `dialog::backdrop` rules per theme. `::backdrop` does not inherit custom properties before Chrome 122 and Firefox 120, so it gets literal values under the theme selectors.
- **Switch:** JavaScript sets `<html data-theme="light|dark">` to the **resolved** theme (ARCH-DECISION-035 at boot, the `ThemeController` afterwards). A switch is one attribute write: the whole page restyles in one style recalculation, with no component re-render. `color-scheme` follows, so native controls, selects and scrollbars adapt.
- **Logic:** pure modules with injected ports, `theme-mode.ts` (parse, resolve, safe storage) and `theme-controller.ts` (`matchMedia` change, `storage` event from another panel, persistence with session fallback). `ThemeProvider.tsx` only mirrors the controller into a Solid signal (`useTheme()`).
- **Contrast is tested on the tokens:** `contrast-requirements.ts` lists the foreground/background pairs the app uses (text 4.5:1; fields, focus and status graphics 3:1). A test checks them in both themes. A few non-text pairs that fail in today's dark theme are named `DARK_CONTRAST_EXCEPTIONS`, because dark must stay as it was. The test fails if an exception becomes stale, and no text pair may be an exception.
- **Charts:** Chart.js reads colours as values, not CSS. `chart-theme.ts` derives `ChartColours` from the tokens; the chart component applies them at creation and in an effect on the resolved theme, then calls `chart.update("none")`.
- **Syntax palette (ARCH-DECISION-025):** `SYNTAX_PALETTES` gains a light palette, tested at 4.5:1 on the light background like the dark one. Its custom properties (`--syntax-*`, `--text-view-*`) are no longer set inline by the text body. They are emitted per theme by the same `themeBaseStyles()`, so an open preview recolours with the rest of the page.
- **EcoIndex badges:** filled with the grade colour, with black or white text, whichever contrasts most. They are the same in both themes and readable on any surface.
- **Guard:** `theme-sources.test.ts` scans the UI sources and fails on Tailwind palette colour classes, hex or `rgb()` literals, and `fill="#…"` outside the allow-list: the theme modules, the syntax palette, the brand logo, and the infra fakes that draw content images.

## Consequences

- A new UI colour is a new token: one name in `theme-types.ts`, two values, and at least one contrast requirement. A Tailwind palette class in a component fails the guard test.
- The generated CSS grows by about 2 kB (two variable blocks).
- Tailwind's config is now TypeScript and imports `src/app/ui/theme/*`. Those modules must stay free of browser globals, Solid and `import.meta`.
- Dark changes only where today's dark failed text contrast. Each change is listed in TECH-US-030-plan §1.3 and in the review.
