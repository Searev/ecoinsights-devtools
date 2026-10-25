# Review: US-024 to US-027, epic BP3 (four new best practices)

- **Stories:** [EPIC-BP3-conventions](../stories/EPIC-BP3-conventions.md), [US-024](../stories/US-024.md), [US-025](../stories/US-025.md), [US-026](../stories/US-026.md), [US-027](../stories/US-027.md)
- **Plan:** [TECH-US-024-027-plan.md](../architecture/TECH-US-024-027-plan.md)
- **Decisions:** no new ARCH-DECISION; the rules follow ARCH-DECISION-004 and 017 unchanged.
- **Reviewer:** tech lead
- **Status: APPROVED** (automated gates passed; lead decisions to confirm, §4; manual browser checks pending, §5)

## 1. Quality gates

| Gate | Result |
|---|---|
| TDD | Each of the four scopes wrote its test file first and ran it red (module not found), then implemented until green. Scope A also had 2 wrong expected sizes in its own tests after implementing (the SVG style is 12 characters, the module script 15); the tests were fixed, not the rule. |
| Context isolation | Four new rule files in `domain/best-practices/rules/`, no protocol, port, model, engine or UI change. Domain rules hold: no `chrome`/`browser`, no `infra/` or `ui/` import. Both collectors are self-contained (checked by each rule test and by `rules-registry.test.ts`). |
| Reactive state | Synchronous rules, no loading state (EPIC-BP2 §10). DOM rules return no `compliance` and "La page n'a pas pu être inspectée" when `page` is undefined, as `avoid-media-autoplay.rule.ts`. |
| UI | No UI change. US-024 and US-027 lines carry no `ref`, so `capLines` omits `lineRefs` and `fileOrTextLine` renders them as plain text; Solid renders `<script>` in a line as text, never as HTML. US-026 lines carry `{ url }` with no `preview`: shortened name, no button (`legacyLinePreview` returns `undefined` for unknown rule ids). |
| Full suite | `npm run typecheck`: clean. `npm run lint`: 0 errors, plus the known `solid/reactivity` warning in `browser-context.tsx`. `npm test`: 94 files, 1 684 tests passed (baseline 90 / 1 607). `npm run build`: Chrome and Firefox built and zipped. `npm run lint:firefox`: 0 errors, 2 warnings that are not from this epic (`MISSING_DATA_COLLECTION_PERMISSIONS` on the manifest, `UNSAFE_VAR_ASSIGNMENT` in the Solid runtime chunk `app-*.js`). The reviewer re-ran all of them; `src/app/domain/best-practices` was run 3 more times, green each time. |

## 2. Delivery

| Scope | Files | Tests |
|---|---|---|
| A, US-024 | `rules/externalize-css-js.rule.ts`, `.rule.test.ts` | 23 (scenarios 1–8, boundaries, type matrix, SVG `<style>`, `src` even empty, 20-line cap, NFR) |
| B, US-025 | `rules/limit-requests.rule.ts`, `.rule.test.ts`; one test in `use-case/analyse-web-flow.test.ts` (scenario 5) | 10 + 1 |
| C, US-026 | `rules/limit-css-files.rule.ts`, `.rule.test.ts` | 17 (scenarios 1–7, boundaries, 304 weight, fragments, 500, NFR) |
| D, US-027 | `rules/limit-canvas.rule.ts`, `.rule.test.ts` | 18 (scenarios 1–6, ordering incl. 300 × 0, shadow root, one rect per canvas, NFR) |
| Lead | `best-practices/index.ts` (4 rules after `AvoidMediaAutoplay`), `rules-registry.test.ts` (17 ids; collectors gain `ExternalizeCssJs`, `LimitCanvas`), README, CHANGELOG, story statuses | — |

NFR timings, best of 10: US-024 500 elements collect + evaluate 9–9.5 ms in jsdom (budget 20 ms); US-026 2 000 requests 1.7 ms (10 ms); US-027 200 canvases 0.4 ms (10 ms).

## 3. Code review notes

- **US-024 `collect()`:** one `querySelectorAll("style, script")`, tag from `localName` (so SVG `<style>` and `<script>` are handled), `hasAttribute("src")` skips external scripts even with an empty `src`, type normalised by trim / lower case / parameters dropped. The JS MIME list is a literal inside the function. Lines sorted by size then document index.
- **US-025:** `requests.length`, the same array the engine and `createPageAnalysis` receive (`analyse-web-flow.ts`), so it cannot disagree with the "Requêtes" column; the use-case test proves it on an emitted page with a duplicate and a 404.
- **US-026:** `lastRequestPerUrl` with `(2xx || 304) && textFileType === "CSS"`, so fragment variants and duplicates count once, and a failed later request does not erase a successful earlier one. A grade has no lines.
- **US-027:** `getBoundingClientRect` once per canvas, no `getComputedStyle`; stable sort gives document order on ties.
- **Risk:** the US-024 combined NFR test runs in jsdom with a 20 ms budget; it measured 25.9 ms once while four agents ran tests in parallel. Kept at the story's budget; if it flakes in CI, assert on `evaluate` alone (already a separate test) rather than loosen the story.

## 4. Deviations and lead decisions (to confirm by the owner)

Plan §2 in full; the ones that change visible output:

1. **US-024 size format.** The story says "shown with `formatKo`" but gives "0,4 ko" as an example, which `formatKo` (integer) cannot produce. The example wins: at most one decimal (12 000 → "12 ko", 400 → "0,4 ko", 50 → "0,1 ko"), with a helper private to the rule. `formatKo` is unchanged elsewhere.
2. **US-026 weight of a 304:** decoded size (`responseSize`) when known, else transferred size, since a 304 is "served from the cache". Other statuses: transferred size, else decoded (US-013).
3. **US-027 "non affiché"** is exactly 0 × 0. A 300 × 0 canvas is shown as "300 × 0 px", after the canvases with a positive area and before the hidden ones.
4. **Counts with French grouping** (`formatCount`) in the US-025 detail, the US-026 C detail and US-027 detail and sizes ("1 920 × 1 080 px").
5. **Aggregated view, existing behaviour (limitation, now in the README):** lines are deduplicated by text, within and across pages. Two anonymous inline scripts of the same size, or two canvases of the same size, show one line while the detail counts two. A follow-up story can number or count duplicates if the owner wants.
6. **US-027 detail for one canvas** keeps "s'ils" exactly as the story's scenario 2 writes it ("1 élément canvas : vérifier s'ils peuvent…").

## 5. Manual checks pending

- [ ] Chrome and Firefox, on a site with inline `<script>` (for example Google Tag Manager) and JSON-LD: "Externaliser les CSS et JavaScript" counts the JS blocks only; the line texts show `<script id="…">` literally.
- [ ] On a CSS-in-JS SPA (styled-components, Emotion): injected `<style>` are counted after a navigation.
- [ ] "Limiter le nombre de requêtes HTTP" shows the same number as the "Requêtes" column on several pages of a journey.
- [ ] "Limiter le nombre de fichiers CSS" on a site with 1–2 bundled stylesheets (B with lines and shortened names, no preview button), and on a reload served with 304s (weights are not "0 ko").
- [ ] "Limiter l'utilisation des éléments canvas" on a page with a chart library (Chart.js) and a hidden canvas; on a page whose collector cannot run (`chrome://`, the Web Store), both DOM rules show "Non évaluée".
- [ ] `npm run lint:firefox` warnings unchanged on the owner's machine.
- [ ] Git: nothing is committed; the owner decides branch and commit.
