# Review: US-028 and US-029, epic BP-UX (clearer best-practice panels)

- **Stories:** [US-028](../stories/US-028.md) (reference, description, link), [US-029](../stories/US-029.md) (offenders indicator)
- **Plan:** [TECH-US-028-029-plan.md](../architecture/TECH-US-028-029-plan.md)
- **Decisions:** [ARCH-DECISION-032](../architecture/ARCH-DECISION-032-static-rule-metadata-table.md) (static metadata table keyed by rule id), [ARCH-DECISION-033](../architecture/ARCH-DECISION-033-persisted-best-practice-indicator.md) (persisted per-page indicator, aggregated in the view)
- **Reviewer:** tech lead
- **Status: APPROVED.** The automated gates passed and the licence was checked (§3). The lead decisions in §4 await the owner's confirmation, and the manual browser checks in §5 are still pending.

## 1. Quality gates

| Gate | Result |
|---|---|
| TDD | Every wave-1 scope wrote its tests first and ran them red. Red runs: A, modules not found; B, 30 failing; C, 17 failing; D, 17 failing; E, 26 failing in the view plus failures in the engine, store and indicator tests. One gap: scope A generated `rule-metadata.ts` before appending the registry tests, so `rules-registry.test.ts` has no red run. The data is also covered by `rule-metadata.test.ts`, which was red first, and by the lead's verbatim diff (§3). Scope F, the `.tsx` rendering, has no tests: the project has no Solid component tests, and its logic is in the tested helpers. |
| Context isolation | `domain/` has no `chrome`/`browser` and no `infra/` or `ui/` import; lint enforces it. `rule-metadata.ts` imports only a type and is not imported by `index.ts`: the built background has none of the texts, and `systemfontstack` appears only in the panel chunk `AnalysisResult-*.js`. No `collect()` changed. The link uses the existing `Browser.openUrlInNewTab` port, with no protocol change. |
| Reactive state | Static data, so there is no loading state. The indicator follows the rule's states: none while `progress` is set, none without `compliance` (the engine guard), and none on legacy pages. The codec drops a malformed indicator. |
| UI and accessibility | Reference label, name and indicator are inside the header `<button>`, in that order, so they form its accessible name. The link is a real `<button>` whose name includes the reference. Bold is `<strong>`. Descriptions are rendered as Solid text nodes, never as `innerHTML`, so `<video>` is literal. Percentages are text. |
| Full suite | Re-run by the reviewer: <ul><li>`npm run typecheck`: clean.</li><li>`npm run lint`: 0 errors, 1 known warning (`solid/reactivity`, `browser-context.tsx`).</li><li>`npm test`: **98 files, 1 871 tests passed** (baseline 94 / 1 684).</li><li>`npm run build`: Chrome and Firefox built and zipped.</li><li>`npm run lint:firefox`: 0 errors, the same 2 older warnings.</li></ul> |

## 2. Delivery

| Scope | Files | Notes |
|---|---|---|
| Lead, contract | `models/best-practice.ts` (`BestPracticeIndicator`, unit arrays, `BestPractice.indicator`), `best-practices/rule.ts` (`RuleResult.indicator`) | |
| A, US-028 data | `best-practices/rule-metadata.ts` (+ test), `rules-registry.test.ts` (+37 tests), `ui/analysis/rich-text.ts` (+ test), `ui/analysis/best-practice-reference.ts` (+ test) | 105 tests in its files; descriptions extracted by script from the story |
| B, request rules | add-cache-headers, compress-text-files, prefer-http2, limit-domains, limit-requests, limit-css-files, minify-text-files | `checked` counter added to the compression loop |
| C, DOM rules | avoid-media-autoplay, provide-text-alternatives, externalize-css-js, limit-canvas, print-stylesheet; use-lazy-loading (test only) | no collector touched |
| D, image rules, GIF, fonts | image-rule-helpers (`summariseImageFindings` option `indicator`), dont-resize-images, optimised-formats (`compliantCount`), limit-gifs, standard-fonts | lines and `lineFindings` order unchanged |
| E, engine, codec, view | `engine.ts`, new `best-practices/indicator.ts` (`isBestPracticeIndicator`), `store-codec.ts`, `best-practices-view.ts` (`formatIndicator`, `journeyIndicator`, `indicator`, `pageIndicators`) | NFR: 50 pages × 17 rules aggregated in 0.72–0.75 ms, best of 10, against a 5 ms budget |
| F, rendering | `BestPractices.tsx`, `about/About.tsx` (credits) | |
| Lead, docs | README (feature section, "Ajouter une bonne pratique", credits), CHANGELOG, ARCHITECTURE §3.3, CLAUDE.md, ADR 032 and 033, story statuses | |

No existing assertion was changed in a way that matters. One existing fixture, `groupByCategory` in `best-practices-view.test.ts`, gained `pageIndicators: []` because the field is now required. No grade, detail, threshold, line text or line order changed.

## 3. Licence check (US-028 §3)

- **RWEB referential:**
  - The rweb.greenit.fr footer and the `LICENCE.md` of github.com/cnumr/best-practices both state **CC BY-NC-ND 4.0**.
  - The texts may be used freely for non-commercial purposes. The credit to GreenIT.fr / Collectif conception numérique responsable must be kept, with links to https://collectif.greenit.fr and https://www.ecoconceptionweb.com, and the texts must not be modified.
- **RGAA (DINUM):** Licence Ouverte 2.0.
- **Verdict: reuse is not forbidden, so delivery went ahead.**
  - The attribution is in the README "License" section and on the "A propos" page.
  - The descriptions are verbatim. The lead diffed all 15 against the story with an independent script: 14 bullet texts and the PreferHttp2 block all match.
  - The only changes are the format changes allowed by the story: `**bold**` markers, and trimming the space in `**multiplexage **`.
- **Owner to confirm:**
  1. The extension's distribution and use (including audits by a consultancy) count as **non-commercial** within the meaning of CC BY-NC. The EcoIndex formula already bundled has the same licence, so this is not a new kind of risk.
  2. The RWEB texts are not under the AGPLv3 of the code; the README says so.
  3. The owner-supplied texts are excerpts of the sheets. That is allowed: "in whole or in part".

## 4. Lead decisions and deviations, to be confirmed by the owner

**Indicator definitions.** The rule's logic wins over the story's wording (plan §1.2):

1. **`UseStandardFonts` counts distinct font URLs**, the same number as its lines, as scenario 8 requires. Its grade and detail count every font request, so a font URL requested twice shows "3 police(s) téléchargée(s)" with the indicator "2 fichiers de police personnalisés".
2. **`PreferHttp2`:**
   - Offenders are HTTP/1 **requests** and expected is the requests with a known version, as in the detail "(n sur m)". The lines are grouped by host, so scenario 8 ("equals the lines") cannot hold here.
   - With no network request it reads "Aucun élément à vérifier".
   - When every version is unknown, the rule is "Non évaluée" and shows no indicator.
3. **`MinifyTextFiles`, `DontResizeImagesInBrowser` and `UseOptimizedImageFormats`** also list "non évalué(e)" lines, which are not offenders and are excluded from `expected`.
   - Dont-resize: `expected` is the images that were not oversized plus the oversized ones that were estimated.
   - Formats: `expected` is the WebP/AVIF requests, plus the estimated images, plus the images found already optimised.
   - Out-of-scope images (animated, unsupported) are not counted.
   - An oversized or convertible image whose gain is under the noise threshold is checked and compliant.
4. **`ProvideTextAlternatives`:**
   - Offenders are the missing **and** empty alternatives: the empty ones are listed "à vérifier" and give B.
   - Expected is every collected element, decorative ones and tracking pixels included: they are checked and compliant.
5. **`CompressTextFiles`:**
   - Offenders include deflate files, which are listed as "compression faible".
   - Expected is the text files of 1 ko or more that have response headers. Files without headers are not checked, as in the rule.
6. **`PrintStyleSheet` and `DontResizeImagesInBrowser`** show no indicator when the page could not be inspected, although these legacy rules grade A there.
7. **`AvoidMediaAutoplay`:** expected is every `<video>`/`<audio>`. `ExternalizeCssJs`, `LimitCanvas`, `LimitCssFiles`, `LimitDomains`, `LimitGifs` (5 ko or more) and `LimitRequests` count exactly what their detail counts.

**Wording and aggregation:**

8. **Ratio agreement** follows `expected`, as in scenario 7: "1 / 5 fichiers non minifiés".
9. **Percentages:**
   - "< 1 %" when there are offenders but the rounding gives 0;
   - "> 99 %" when not every element is flagged but the rounding gives 100;
   - otherwise `round(100 × o / e)`. This is consistent with the PreferHttp2 detail.
10. **"(page la plus chargée)"** is added when more than one page has an indicator, not when the analysis has more than one page.
11. **While a rule is in progress**, neither the header nor "Pages concernées" shows an indicator, even for pages already settled.
12. **"Pages concernées"** still lists only pages not graded A. An A page counts in the journey sum, but has no line there.
13. **Story names quoted from memory:**
    - "Ne pas redimensionner les images côté navigateur" is actually "… dans le navigateur";
    - "Fournir une print css" is correct;
    - the tests use the real names.

**US-028:**

14. The source line is shown whenever a rule has a reference: on `LimitDomains`, which has no link, and on `DontResizeImagesInBrowser`, which has no description.
15. The link button texts on the "A propos" page are host names, plus "Licence CC BY-NC-ND 4.0".

## 5. Manual browser checks (pending, owner)

The `.tsx` files were built but never shown in a browser. In `npm run dev` (MockBrowser) and in Chrome and Firefox:

1. **US-028:**
   - Header: "RWEB 0075" before the name of "Ajouter des entêtes Expires ou Cache-Control", and no label on "Utiliser le chargement paresseux".
   - Expanded panel order: description, link, source, then detail.
2. "Consulter la fiche RWEB 0047" opens `https://rweb.greenit.fr/fr/fiches/RWEB_0047-limiter-le-nombre-de-requetes-http` in a new tab on Chrome and Firefox. Both go through the Page agent's `tab.open`.
3. PreferHttp2: six lines, with "multiplexage" and "priorisation" in bold. AvoidMediaAutoplay shows "<video>" and "<audio>" as text.
4. A saved analysis from before this version shows the references, descriptions and links, and no indicator.
5. **US-029:**
   - the header indicator sits on the right without breaking the layout on a narrow DevTools panel, with long units such as "médias en lecture ou chargement automatique";
   - "Pages concernées" shows "Titre — 8 / 10 …".
6. During minification analysis or image estimation, the rule shows no indicator, and the indicator appears once the work settles.
7. Screen reader (NVDA or VoiceOver): the header button reads the reference, the name, then the indicator.
8. "A propos" page: the credits section and its five links.
