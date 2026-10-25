# Changelog

## [1.0.0] - 2026-10-25

First public release.

### Release preparation

#### Added

- **Privacy policy** ([PRIVACY.md](PRIVACY.md), in French and English) and the Chrome Web Store submission sheet ([docs/store/CHROME-WEB-STORE.md](docs/store/CHROME-WEB-STORE.md)).
- **Firefox data-collection declaration:** `data_collection_permissions: { required: ["none"] }`, which addons.mozilla.org requires for new add-ons.

#### Changed

- **One name everywhere: "EcoInsights Devtools"**, in the manifest, the DevTools panel, the toolbar, the page headers, the "À propos" page, the package (`ecoinsights-devtools`) and the docs. The storage key of saved analyses is unchanged, so existing analyses are kept.
- **Version 1.0.0** in the manifest and `package.json`, kept equal by a manifest test.
- **Licence:** `package.json` now declares `AGPL-3.0-or-later`, matching `LICENSE`. Third-party content (EcoIndex formula, RWEB descriptions) stays under CC BY-NC-ND 4.0.
- **Dependencies:** each one is pinned to its latest patch release, for example vite 4.5.14, chart.js 4.4.9, tailwindcss 3.3.7 and postcss 8.4.49.
  - eslint-plugin-solid stays at 0.13.0, because 0.13.2 crashes on TypeScript `as` expressions with typescript-eslint 6.8.
  - **solid-js 1.9.6** clears the critical `seroval` advisory, since `seroval` now resolves to 1.6.12. The JSX compiler `babel-preset-solid` is pinned to the same 1.9.6 through `overrides`. Versions 1.9.7 and later either keep a vulnerable `seroval` or need TypeScript 5.4 for their DOM types.

#### Fixed

- **French UI text:**
  - "Rafraîchir", "Déclencher", "Réessayer", "Êtes-vous sûr(e)", "À propos", "Évolution", "Émissions", "Mise en perspective", "Taille max. du DOM", "Chargement en cours…";
  - French quotation marks in the permission help;
  - non-breaking spaces before units ("12 g CO2e", "1 000 visiteurs");
  - spelling on the "À propos" page.
- **"Fournir une CSS print"** replaces "Fournir une print css", with the details "La page dispose d'une CSS print" and "Aucune CSS print trouvée".
- **Canvas wording:** a single canvas reads "1 élément canvas : vérifier s'il peut être remplacé par un élément HTML".
- **Privacy:** `Set-Cookie` response headers are no longer stored with the analyses.

#### Removed

- The "EcoInsights panel created" console log.

### US-030, light mode

#### Added

- **Light theme and a "Thème" selector (US-030).** A native select labelled "Thème", in the toolbar immediately left of "A propos", offers "Système" (default), "Clair" and "Sombre".
  - "Système" follows `prefers-color-scheme` and updates live when the OS or browser appearance changes.
  - The choice applies at once to every screen and to open dialogs: charts are re-coloured without a reload, and an open text preview switches to the light or dark syntax palette.
  - It is stored in its own `localStorage` key (`ecoinsights.theme`). An unknown value or an unavailable storage means "Système", silently, and the choice then lasts for the session.
  - Other open EcoInsights panels follow through the `storage` event.
  - The theme is applied before the first paint by a small external classic script (`theme-boot.js`). The extension CSP is unchanged.
- A light syntax palette for the text preview, tested at 4.5:1 or more on the light background, like the dark one.
- Contrast tests on the colour tokens of both themes (WCAG 2.1 AA: 4.5:1 for text, 3:1 for fields, focus and status graphics), and a source guard test that rejects Tailwind palette classes and colour literals in the UI.

#### Changed

- Every UI colour is a theme token backed by a CSS custom property (`src/app/ui/theme/theme-tokens.ts`). `tailwind.config.js` became `tailwind.config.ts`. Icons use `currentColor`. The native controls and scrollbars follow the theme through `color-scheme`.
- The dark theme is unchanged, except where it failed WCAG AA text contrast:
  - the danger button is `#dc2626` instead of `#ef4444`;
  - tooltip text and the selected row's text are white;
  - chart ticks and legends are `#bfc6ce` instead of Chart.js's `#666`, with visible grid lines;
  - field placeholders are `#a1a8b2` instead of `#9ca3af`;
  - EcoIndex badges are filled with the grade colour, with a black or white letter (4.5:1 or more for every grade), in both themes.

### US-028 and US-029, epic BP-UX (clearer best-practice panels)

#### Added

- **Reference, description and link for each best practice (US-028).**
  - The panel header shows the referential reference before the rule name, for example "RWEB 0075" or "RGAA 1.1".
  - The expanded panel shows, before the detail:
    - the description, quoted verbatim from the RWEB referential or the RGAA, with line breaks kept and `**bold**` as the only markup (plain text, never HTML);
    - a "Consulter la fiche RWEB 0075" or "Consulter le critère RGAA 1.1" link, opened in a new tab;
    - the source line.
  - The data is static (`RULE_METADATA`, looked up by rule id), so analyses saved earlier show it too. Nothing is persisted.
  - "Compresser les fichiers textuels" is RWEB 0076.
  - Credits for the RWEB referential (CC BY-NC-ND 4.0, GreenIT.fr / Collectif conception numérique responsable) and the RGAA (Licence Ouverte 2.0, DINUM) are in the README and on the "A propos" page.
- **Offenders indicator (US-029).** Each rule except "Utiliser le chargement paresseux" now stores, per page, an indicator computed from the same elements as its grade. It takes one of three forms:
  - a ratio, for example "8 / 10 ressources sans cache (80 %)";
  - a count, for example "52 requêtes HTTP";
  - a presence, for example "CSS print : non".

  How it is shown:
  - The header shows the journey indicator:
    - ratios are summed over the pages;
    - counts take the worst page, with "(page la plus chargée)" when several pages count;
    - the print stylesheet reads "CSS print absente sur 3 pages sur 4".
  - Each page in "Pages concernées" ends with its own indicator ("Accueil — 8 / 10 …").
  - A ratio with nothing to check reads "Aucun élément à vérifier". A non-zero share under 1 % reads "< 1 %", and one over 99 % short of 100 % reads "> 99 %".
  - There is no indicator while a rule is in progress, for "Non évaluée" pages, or for analyses saved earlier (never recomputed).
  - Stored indicators are validated when loading, and a malformed one is dropped.
  - Grades, details, thresholds and lines are unchanged. The CSV export is unchanged.

### US-024 to US-027, epic BP3 (four new best practices)

#### Added

- Four best practices, graded per page:
  - **"Externaliser les CSS et JavaScript"** (`ExternalizeCssJs`, US-024): non-empty `<style>` and inline JavaScript `<script>` (no `src`; no type, `module` or a JavaScript MIME type) in the DOM at collection time, styles injected by scripts included. A for 0 to 2, B for 3 to 5, C for 6 or more. B and C list each block as "<script id=\"gtm\"> en ligne : 0,3 ko", largest first. Data scripts (`application/ld+json`, `importmap`, `speculationrules`, templates) are ignored.
  - **"Limiter le nombre de requêtes HTTP"** (`LimitRequests`, US-025): every recorded request, the same number as the "Requêtes" column. A up to 40, B for 41 to 70, C for 71 or more. No lines.
  - **"Limiter le nombre de fichiers CSS"** (`LimitCssFiles`, US-026): distinct CSS URLs answered 2xx or 304. B for 0 to 2 (styles possibly inlined or bundled into one oversized file), A for 3 to 10, C for 11 or more. B and C list "file name : weight", heaviest first.
  - **"Limiter l'utilisation des éléments canvas"** (`LimitCanvas`, US-027): `<canvas>` elements attached to the top-frame DOM, displayed or not. A without any, B from one, never C. Lines give the displayed size ("<canvas id=\"chart\"> : 600 × 400 px", or "non affiché").
- The two DOM rules are "Non évaluée" ("La page n'a pas pu être inspectée") when the page could not be inspected. They add two page scripts per collection.
- Analyses saved earlier don't list the new rules.

### US-019 to US-021

#### Fixed

- **Fewer false positives in "Minifier les fichiers CSS, JavaScript, HTML et SVG" (US-021).**
  - Files named `*.min.js`, `*.min.mjs` or `*.min.css` are minified by declaration: their content is not read, and they are never "non évalué".
  - Only whitespace from the line structure counts (line breaks, indentation, trailing whitespace). Comments and whitespace inside a line no longer count, which removes the misreads of minified JavaScript.
  - A file is flagged only with at least 5 % and 1 000 removable characters.
  - Analyses saved earlier keep their grade.

#### Added

- **Text file preview (US-020).** In "Minifier les fichiers CSS, JavaScript, HTML et SVG", the name of a "non minifié" file opens its content in the app dialog.
  - It shows the type, the weight and the number of lines, then the raw content with line numbers (not copied with the text) and wrapped lines.
  - Syntax colouring covers JavaScript, JSON, CSS, and HTML / SVG as markup, with comments in italics. It is done by an in-house tokenizer, loaded only when the first text preview opens, and falls back to plain text on any failure.
  - Only the first 500 000 characters are displayed, with the notice "Affichage limité aux 500 premiers ko (fichier de … ko)."
  - The content is read from DevTools, else re-downloaded from the HTTP cache, decoded with the response charset, and kept in the session cache. It is never interpreted as HTML, never stored, and never used for the grade.
  - "Non évalué" lines stay plain text. Offender lines of analyses saved earlier are clickable too.

#### Changed

- **"Limiter l'utilisation des GIFs animés" (US-019)** ignores GIFs under 5 ko (5 000 bytes), such as tracking pixels. The grade counts only GIFs of 5 ko or more, and the detail mentions the ignored ones ("(2 GIF de moins de 5 ko ignorés)"). Analyses saved earlier keep their grade.

### US-015 to US-018, epic PV (preview the flagged elements)

#### Added

- **Clickable file names.** The shortened name of a line is a button opening a preview, in "Fournir une alternative textuelle aux contenus multimédias", "Utiliser le chargement paresseux", "Limiter l'utilisation des GIFs animés", "Éviter la lecture et le chargement automatique des vidéos et des sons" and "Utiliser des polices standards".
  - Lines without a file, `<area>` lines, and `blob:` and `data:` URLs stay plain text.
- **Image preview (US-015).**
  - It works for every format the browser displays (JPEG, PNG, WebP, AVIF, GIF with animation, SVG, BMP, ICO).
  - It shows the resolution read from the file, the format (including "GIF animé") and the weight.
  - The image is drawn at its size on the page, or in "Taille réelle". "Image non affichée sur la page" is shown when it has no box.
  - Files over 25 MB are refused without being decoded.
- **Video and sound preview (US-016).**
  - The native player loads metadata only, never autoplays, and stops playback and the download on close.
  - It shows the resolution, the duration ("1 min 32 s"), the format and the weight downloaded by the page, partial `206` responses included.
- **Iframe data (US-017).** The host, the document type, the transferred weight and the position on the page. The iframe is never loaded.
- **Font preview (US-018).**
  - It shows the Voltaire sample at 32 px, in the downloaded font or in the "Sans-serif", "Serif" and "Mono" system stacks, with the format and the weight.
  - The font is registered only in the extension panel and removed on close.
- One dialog for the whole app hosts the comparison and every preview: Escape, a backdrop click and "Fermer" close it, and focus returns to the clicked name.
- Previewed files share the comparison's session cache (50 MB, least recently used first), so reopening is instant.

#### Changed

- "Utiliser des polices standards" lists "file name : weight", one line per file, heaviest first, at most 20 lines. Its grade and detail are unchanged. Analyses saved earlier keep their URL lines.
- "Limiter l'utilisation des GIFs animés" now reads the display size of the page's images (one more page script per collection). The other three rules also record the CSS box of their elements. Grades and line texts are unchanged.
- The README privacy section covers the previews: images and fonts may be re-downloaded from the HTTP cache, playing a medium downloads it from the panel, and nothing is stored or sent to a third party.

### US-006 to US-014, epic BP2 (nine new best practices)

#### Added

- Nine best practices, graded per page (a page with nothing in scope is A):
  - **"Fournir une alternative textuelle aux contenus multimédias"** (`ProvideTextAlternatives`, US-006): images, image inputs, `area` and videos without a text alternative are C; an empty `alt` is B ("à vérifier"); decorative ARIA and tracking pixels are ignored.
  - **"Utiliser le chargement paresseux"** (`UseLazyLoading`, US-007): images and iframes below the initial screen loaded eagerly; one gives B, more give C. Script-based lazy loading (`data-src`) counts as lazy.
  - **"Compresser les fichiers textuels"** (`CompressTextFiles`, US-008): HTML, CSS, JS and SVG files of 1 kB or more without `content-encoding` (C) or with `deflate` (B).
  - **"Ajouter des entêtes Expires ou Cache-Control"** (`AddCacheHeaders`, US-009): static files whose headers do not allow caching (`no-store`, `no-cache`, `max-age=0`, past or invalid `Expires`, none); B if some, C if none is cacheable.
  - **"Minifier les fichiers CSS, JavaScript, HTML et SVG"** (`MinifyTextFiles`, US-010): files whose comments and extra whitespace make 5 % or more of the content captured by DevTools. Contents are read in the background ("Analyse en cours… (n/N fichiers)"), never re-downloaded and never stored; files without captured content are "non évalués".
  - **"Limiter le nombre de domaines servant les ressources"** (`LimitDomains`, US-011): A below 5 host names, B at 5, C above; one line per domain.
  - **"Privilégier HTTP/2 à HTTP/1"** (`PreferHttp2`, US-012): share of network requests over HTTP/1.x; B below 10 %, C from 10 %; lines per domain.
  - **"Limiter l'utilisation des GIFs animés"** (`LimitGifs`, US-013): every distinct GIF downloaded; one gives B, more give C.
  - **"Éviter la lecture et le chargement automatique des vidéos et des sons"** (`AvoidMediaAutoplay`, US-014): `video` and `audio` with `autoplay` or `preload="auto"`; one gives B, more give C.
- File names in the lines of these rules use the shortened display name of US-004 (full name on hover and for screen readers).
- Recorded requests keep their HTTP version and start time (persisted; older analyses load unchanged).

#### Changed

- Offender lists of the new rules are capped at 20 lines, then "… et N autres".
- The image estimation queue is now built on a generic work queue, shared with the content analysis. Its behaviour is unchanged.

### US-004 and US-005, image comparison

#### Added

- **Image comparison dialog (US-005).** In both image rules, the name of each offending image is a button that opens a modal dialog.
  - The toggle switches between "Originale" and the rule's optimised version: "Redimensionnée", "AVIF" or "WebP sans perte". An image flagged by both rules also offers "Les deux".
  - Each version shows its resolution, weight, format and gain ("−144 ko (−60 %)"). The header shows the full URL.
  - Versions are drawn at the image's size on the page by default; "Taille réelle" draws them at native resolution, keeping the scroll position between versions.
  - Variants are generated on demand by the existing codec worker, with the estimation settings, so their size matches the estimate. This also works on saved analyses (the original is re-downloaded when needed).
  - Generated images are kept in memory for the panel session (50 MB, least recently used first). Each version has its own loading and error state with "Réessayer".
  - A notice tells when the image changed since the analysis.
- **Shortened image names (US-004).** Long file names show as the first 12 characters, "...", the last 12 and the extension. The full name is in the tooltip and in the accessible name.

#### Changed

- "Utiliser des formats d'image optimisés" now also reads the display size of the page's images (one more page script per collection). Its grade and lines are unchanged.
- Image findings record the natural size, the display size and the byte length the estimator saw. Older analyses open the comparison in "Taille réelle".

### US-001 to US-003, image optimisation

#### Added

- **"Ne pas redimensionner les images dans le navigateur" measures a real gain.**
  - Oversized images are compared with their display size multiplied by the screen density, which the detail shows ("Densité d'écran : 2x").
  - Each one is re-encoded at its target size, in its own format.
  - The rule is graded by the share of the image weight that can be saved: A below 10 %, B up to 30 %, C above. Gains under 10 kB are ignored.
- New best practice **"Utiliser des formats d'image optimisés"** (`UseOptimizedImageFormats`): JPEG images are estimated as AVIF (quality 65) and PNG images as lossless WebP, with the same grading.
- **Estimated image gain** per page and for the whole journey, without double counting between the two rules. An image flagged by both is estimated resized *and* converted.
  - Images served from the cache count as 0 on that page.
  - Pending and partial results are labelled ("≥ … (estimation en cours)", "(N images non évaluées)", "(partiel)").
- **Progress display:** while images are being estimated, the rule shows "Estimation en cours… (n/N images)" instead of a grade, and updates by itself, including on pages already closed.
- **CSV export:** new column "Gain images estimé (ko)". It is suffixed " (partiel)" while estimating, and empty for analyses saved before this version.
- **WASM image codecs:** the single-thread `@jsquash/*` builds of mozjpeg, PNG, oxipng, WebP, AVIF and resize.
  - They run in a dedicated Web Worker and are loaded only when needed, adding about 5.9 MB per browser package.
  - The extension may re-download images of the analysed site, from the HTTP cache when possible, when DevTools did not keep their content. Nothing is sent to any third party.

#### Changed

- **Chrome 103 or later is required**, because the manifest CSP now allows `'wasm-unsafe-eval'` to compile the codecs. Firefox stays at 109 or later.
- Stopping an analysis while estimations are running saves it at once. The pending images are shown as "non évaluée (analyse arrêtée)".
- GIF, BMP, ICO, TIFF, SVG and animated images are not evaluated by the image rules.

### REFACTOR-001

#### Changed

- **Single code path for Chrome and Firefox.**
  - The DevTools panel now talks to one background **Page agent** through a typed protocol (`src/shared/protocol.ts`), with request ids, timeouts and explicit errors.
  - `BrowserChrome`, `BrowserFirefox` and the old bridge are removed.
- **Probe injected on demand.** The navigation Probe is only injected in the inspected tab while an analysis is recording. Firefox no longer injects a content script into every page.
- **Best practices are now stateless rules.** Each rule is one file: an optional page `collect()` and a pure `evaluate()`. They run on both browsers.
- **The analysis use case owns DOM polling and best-practice scheduling.** It receives the `Browser` by injection.
- **Per-browser build.**
  - `npm run build` produces `dist/chrome`, `dist/firefox` and their zips, from `src/manifest/base.json` plus per-browser overlays.
  - The `contextMenus` and `activeTab` permissions are removed.
  - Firefox gets a `gecko.id`.
- **Best-practice results** are grouped by category, list the offending resources, and show "Non évaluée" when a rule could not run.

#### Added

- New best practice: **"Utiliser des polices standards"** (`UseStandardFonts`), which counts the downloaded font files and their weight.
- An error screen with "Réessayer" when an analysis cannot start: missing permission, or the background script not responding.
- A banner when an analysis cannot be saved because browser storage is full.
- A test suite (Vitest + jsdom), plus `npm test`, `npm run typecheck` and `npm run lint`.
- Architecture documentation and decision records in `docs/architecture/`.

#### Fixed

- Best practices were never evaluated on Firefox.
- "Refresh on start" measured the previous page on Firefox (the reload resolved too early).
- Chrome reported the site permission as always granted.
- Startup failed on Chrome with undocked DevTools.
- The Probe's single-instance guard never worked, so click listeners piled up on every navigation.
- Background subscriptions leaked when one of several DevTools panels was closed.
- Best-practice results were one tick late, and leaked between pages and analyses.
- The "new page on form submit" option had no effect.
- Images resized along one axis only, or with "svg" in their URL path, were not reported.
- Purging the cache before an analysis also erased the browser's download history.
- New analyses were not persisted until they were stopped.
