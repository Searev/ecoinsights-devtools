# Review: US-030, light mode with a "Thème" selector

- **Story:** [US-030](../stories/US-030.md)
- **Plan:** [TECH-US-030-plan.md](../architecture/TECH-US-030-plan.md)
- **Decisions:** [ARCH-DECISION-034](../architecture/ARCH-DECISION-034-theme-tokens-css-variables.md) (tokens as CSS custom properties, `data-theme` switch) and [ARCH-DECISION-035](../architecture/ARCH-DECISION-035-pre-paint-theme-boot-script.md) (pre-paint boot script, CSP unchanged)
- **Branch:** `feat/light-mode`, from `develop` (c4b460a). Nothing is committed: the owner decides on git.
- **Date:** 2026-10-25

Status: APPROVED (automated gates). Manual browser checks are pending (§5).

## 1. Quality gates

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors (exit 0) |
| `npm run lint` | 0 errors, 1 warning. It is the baseline warning (`solid/reactivity` in `infra/browser-context.tsx`). |
| `npm test` | 109 files, 2 183 tests passed (baseline 98 files, 1 868 tests). One run during the review had 2 failures; three consecutive full runs afterwards were green. Members reported the same load-sensitive timing tests in `syntax/markup.test.ts` failing once each while another suite ran in parallel. They predate this story. |
| `npm run build` | Chrome and Firefox built. `theme-boot.js` (564 bytes) is in both, and is the first element of `index.html`'s `<head>`, as a classic script. `devtools.html` does not get it. |
| `npm run lint:firefox` | 0 errors, 0 notices, 2 warnings (same as baseline) |
| `scripts/manifest.test.mjs` | 13 tests passed. The test file and `src/manifest/*` are unmodified, so the CSP is unchanged (scenario 12). |

### The five quality gates

1. **TDD.** Every member reported a red run before implementing:
   - module-not-found errors for each new test file (A: `theme-mode`, `theme-controller`, `theme-boot`, `vite-theme-boot`; B: `theme-tokens`, `contrast-requirements`, `theme-styles`, `chart-theme`, `ecoindex-badge-style`);
   - a `TypeError` on `SYNTAX_PALETTES` for C's two changed tests.

   `contrast.test.ts` had no red phase: the lead moved `contrast.ts` verbatim from an already-tested module. The lead wrote the source guard `theme-sources.test.ts` red (18 failing files) before wave 2, and it went green through the sweep. The placeholder token added in review went red (missing `placeholder` in the palettes, 5 failures), then green.
2. **Isolation.** The domain is untouched. Theme logic is pure with injected ports (`ThemeStorage`, `ColorSchemeQuery`, `ThemeRoot`, `StorageEventSource`). `.tsx` files only wire it. `ui/theme/*` and `syntax-palette.ts` contain no browser globals, Solid or `import.meta`, because `tailwind.config.ts` loads them.
3. **Reactive state.** The theme is synchronous, with no `idle/loading/loaded/error` lifecycle to model. `ThemeController` is the single source of truth, and `ThemeProvider` mirrors it into one signal. Storage failures fall back to `system` silently, and the choice is then kept for the session.
4. **UI and accessibility.**
   - The theme selector is a native `<select id="theme-mode">` with `<label for="theme-mode">Thème</label>`, placed immediately left of "A propos". Its options follow `THEME_MODES`: Système, Clair, Sombre.
   - Focus outlines use the `focus` token, at 3:1 or more in both themes.
   - `color-scheme` follows the theme, so native controls and scrollbars adapt.
5. **Full suite:** green (§1 table).

## 2. Delivery

| Scope | Owner | Content |
|---|---|---|
| Contract | lead | `theme-types.ts`, `contrast.ts`, plan, ADR 034/035 |
| A | member | `theme-mode.ts` (24 tests), `theme-controller.ts` (13), `theme-boot.ts` + `.entry.ts` (7), `ThemeProvider.tsx`, `scripts/vite-theme-boot.mjs` (9; runs the built IIFE in `node:vm`) |
| B | member | `theme-tokens.ts` (11), `contrast-requirements.ts` + `theme-contrast.test.ts` (93), `theme-styles.ts` (7), `chart-theme.ts` (5), `contrast.test.ts` (5), `shared/ecoindex-badge-style.ts` (15) |
| C | member | `SYNTAX_PALETTES` light + dark, `syntaxThemeVariables`, `text-view.css` on variables, `TextPreviewBody.tsx` no longer sets inline colours |
| Integration | lead | `tailwind.config.ts` (replaces `.js`), `index.css`, `vite.config.ts`, `scripts/vite-theme-boot.d.mts`, `tsconfig.json`, `index.tsx` (controller + provider), `Toolbar.tsx` (select), `theme-sources.test.ts`, `placeholder` token |
| D | member | icons on `currentColor`, `Loader.css`, `EcoIndexBadge`, `DomProfileChart` (re-colours on theme change), `MetricsDetailSingle`, `ConfimDialog`, `SaveErrorBanner`, `DialogHost`, `ComparisonBody` |
| E | member | `BestPractices`, `AnalysisResult`, `AnalysedPage`, `ImageName` |

### Colour-literal inventory after the sweep

- Searching `src/app` (`.ts`, `.tsx`, `.css`, tests excluded) for Tailwind palette classes (`white`, `black`, `gray`, `red`, `yellow`, `green`, `primary`… with any utility and variant) finds **none**.
- Hex, `rgb()`/`hsl()` and `fill="#"` literals remain only in the guard's allow-list:
  - token definitions: `ui/theme/theme-tokens.ts`, `theme-styles.ts`, `chart-theme.ts`;
  - `syntax-palette.ts`;
  - `icons/Logo.tsx`, the brand logo;
  - `ecoindex-badge-style.ts`, which picks black or white text;
  - the `infra/` fakes that draw content images;
  - `domain/` fixtures.
- Outside the allow-list, CSS uses only `rgb(var(--color-…))` (`index.css`, `Loader.css`), and `text-view.css` uses only `var(--text-view-*)` and `var(--syntax-*)`.
- `theme-sources.test.ts` keeps this enforced.
- **Not covered:** `src/index.html` keeps `<meta name="theme-color" content="#000000">`. It has no effect in a DevTools panel, so it was left alone.

### Final light palette (tokens)

The plan's proposal passed every requirement as is, plus `placeholder`:

| Token | Light | Token | Light |
|---|---|---|---|
| background | `#ffffff` | danger / dangerStrong | `#dc2626` |
| surface | `#f3f4f6` | dangerHover | `#991b1b` |
| surfaceLight | `#e5e7eb` | warning | `#92400e` |
| onsurface | `#374151` (10.31:1 on background) | tooltip / onTooltip | `#374151` / `#ffffff` |
| strong | `#111827` | selected / selectedHover / onSelected | `#4a69bd` / `#3b5497` / `#ffffff` |
| border | `#d1d5db` | chip / onChip | `#4b5563` / `#ffffff` |
| field | `#6b7280` (4.39:1 on surface, the tightest) | iconMuted | `#6b7280` |
| placeholder | `#5b6472` (5.44:1 on surface) | loader | `#3f51b5` |
| focus | `#1534ba` | marker | `#111827` |
| btn / btnHover / onBtn | `#1534ba` / `#2c3f71` / `#ffffff` | complianceA / B / C / None | `#15803d` / `#a16207` / `#dc2626` / `#6b7280` |
| tableEven / tableOdd | `#f3f4f6` / `#e5e7eb` | chartText / chartGrid / chartLine | `#374151` / `#d1d5db` / `#1d4ed8` |

- The light backdrop is `rgba(0, 0, 0, 0.4)`.
- The light syntax palette is GitHub-light based. Every colour is 4.5:1 or more on `#ffffff`; the lowest is the gutter, `#6e7781` at 4.55:1. The focus colour is `#0969da`.

## 3. Review findings and fixes

1. **Placeholders (fixed by the lead).** Tailwind's preflight colours placeholders `gray-400` (`#9ca3af`): 4.34:1 on dark `surface` today, and about 2.3:1 on light `surface`.
   - New token `placeholder`: dark `#a1a8b2` (4.60:1), light `#5b6472` (5.44:1).
   - A text requirement on `surface`, and a base rule in `index.css`.
   - The hover state on `surfaceLight` is not required, since the field is being pointed at.
2. **`DomProfileChart` indentation** of the Chart.js register list was fixed.
3. **Checked and kept:**
   - In `DomProfileChart`, colours are applied right after creation and again by the theme effect, which also runs once at start (two cheap `update("none")` calls).
   - The cast `chart as unknown as ChartTarget` is the minimum, since Chart.js dataset types have no index signature.
4. **Dark parity.** `theme-tokens.test.ts` asserts the dark palette value by value against the plan's table.
   - The dark values are today's literals, except the §4 deviations.
   - The inherited icon colour is `onsurface` (`<main class="text-onsurface">`), the former `#bfc6ce`.
   - The bare `border` now draws `field` `#e5e7eb`, which is Tailwind's former default, `gray-200`.

## 4. Lead decisions and deviations, to be confirmed by the owner

1. **Dark is not strictly "exactly as before"** where it failed WCAG AA text contrast. Scenario 10 makes text contrast mandatory in both themes. The changes:
   - danger button `#ef4444` → `#dc2626` (white text 3.76 → 4.83:1);
   - tooltip text → white (4.33 → 7.46:1);
   - selected row text → white (3.01 → 5.19:1);
   - chart ticks and legend `#666` → `#bfc6ce` (2.57 → 8.55:1), with grid `#474747` instead of an invisible `rgba(0,0,0,0.1)`;
   - placeholders `#9ca3af` → `#a1a8b2`;
   - **EcoIndex badges filled** with the grade colour and a black or white letter, the same in both themes. Outlined grade-coloured text gave A 4.11:1 and G 3.40:1 on the dark page, and about 1.2:1 on the selected row; in light, yellow on white would be about 1.2:1. This is the most visible change.
2. **Dark non-text exceptions kept as they were** (`DARK_CONTRAST_EXCEPTIONS`, tested as really failing):
   - compliance square C on `surface`, 2.93:1;
   - "not evaluated" square on `surface`, 2.28:1 (it always comes with the "Non évaluée" chip text);
   - loader on `background`, 2.15:1;
   - secondary button border (`btn`) on `background` and `surface`, 1.57:1 and 1.17:1 (the buttons are identified by their text).

   Light passes all of them. The owner may want to lift these in dark later.
3. **"Système" with no OS preference resolves to dark**, the historical look, in both the CSS fallback and the JavaScript.
4. **`data-theme` holds the resolved theme, not the mode.** CSS and JavaScript then read one value, and the media-query fallback covers the case where the script fails.
5. **The syntax colours now come from the stylesheet** instead of inline custom properties set by the text body (amending ARCH-DECISION-025's "Colours" point). An open preview recolours with the page, without a re-render (scenario 9).
6. **The `primary-*` scale stays in the config but is no longer used by components.** The guard rejects it. Brand use goes through tokens (`btn`, `selected`).
7. **Storage key** `ecoinsights.theme`.
8. **Not tested automatically:** the NFR timings (DOM switch within one frame, charts within 100 ms) and real first-paint behaviour. A switch is one attribute write plus one `chart.update("none")` per chart.

## 5. Manual browser checks (pending, owner)

1. **First paint, Chrome 103+ and Firefox 109+:** open DevTools on the EcoInsights panel with the mode "Clair" on a dark OS, then "Sombre" on a light OS. No flash of the other theme (scenarios 1, 5). Repeat after a browser restart.
2. With "Système", switch the OS appearance while the panel is open (with a recorded analysis showing the DOM chart). The panel and the **chart** (ticks, grid, line, tooltip) switch without a reload (scenario 2).
3. "Clair" on a dark OS, then switch the OS: the panel stays light (scenario 3). "Sombre" on a light OS: compare with a screenshot of the previous version; only the §4.1 differences should show (scenario 4).
4. **Two DevTools windows** on two tabs: change the theme in one, and the other follows (scenario 8).
5. Open a **text preview** of a JS file, then switch the theme: the dialog, backdrop and syntax colours switch (scenario 9). Check the image, media, iframe, font and comparison dialogs too.
6. Storage disabled (Firefox `dom.storage.enabled=false`), or a value of `"blue"` set by hand in `localStorage`: the panel opens in "Système" with no error, and selecting a mode still applies (scenario 7).
7. Tab to the "Thème" select: the focus is visible in both themes. A screen reader announces "Thème" (scenario 11).
8. Light theme: scrollbars and native selects are light (`color-scheme`), and the toolbar's analysis selector and its options are readable.
9. `npm run dev`: the selector works, and `/theme-boot.js` is served. Vite still injects the CSS through JavaScript in dev, so a flash is possible there only.
10. Windows high contrast or `forced-colors`: nothing breaks. This is out of scope beyond that.
