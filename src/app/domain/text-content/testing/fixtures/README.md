# Reference fixtures for the minification heuristic (US-010)

Test data only: read with `readFileSync` by `../../minification.test.ts`, never imported by app code.

| File | Expected | Source | Licence |
|---|---|---|---|
| `color.min.js` | minified | `@kurkle/color@0.3.2`, `dist/color.min.js` (copied as is) | MIT, (c) 2023 Jukka Kurkela (header kept) |
| `color.esm.js` | not minified | `@kurkle/color@0.3.2`, `dist/color.esm.js` (copied as is) | MIT, (c) 2023 Jukka Kurkela (header kept) |
| `app.min.js` | minified | derived from `color.min.js`: header replaced by `/*! lib v1.0 \| MIT */`, footer `//# sourceMappingURL=app.js.map` | MIT (derived from the above) |
| `preflight.css` | not minified | `tailwindcss@3.3.3`, `src/css/preflight.css`, with a one-line `/*! … MIT */` header added | MIT, Tailwind Labs and the preflight authors (Nicolas Gallagher, Jonathan Neal, Sindre Sorhus, Adam Wathan, Jonathan Reinink) |
| `preflight.min.css` | minified | one-off build: `npx esbuild --minify --loader=css < preflight.css > preflight.min.css` | MIT (derived from the above) |
| `page.html` | not minified | hand-written for this project (server-rendered page, indented, with comments) | project licence |
| `design-tool.svg` | not minified | hand-written for this project (design-tool style export, indented, with comments) | project licence |
