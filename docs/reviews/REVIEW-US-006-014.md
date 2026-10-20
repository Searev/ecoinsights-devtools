# REVIEW-US-006-014: Epic BP2, nine new best practices

- **Plan:** [TECH-US-006-014-plan.md](../architecture/TECH-US-006-014-plan.md)
- **Stories:** [EPIC-BP2](../stories/EPIC-BP2-conventions.md), [US-006](../stories/US-006.md) to [US-014](../stories/US-014.md)
- **Decisions:** ARCH-DECISION-017, 018, 019 (004, 007 and 015 amended)
- **Branch:** `feat/best-practices-bp2` (uncommitted working tree)
- **Reviewer:** team lead
- **Date:** 2026-10-20

## 1. Delivery summary

| Scope | Content | Tests added | Result |
|---|---|---|---|
| Lead contract | model fields, `LineRef`, content types and port, policy, engine passthrough, `rule-lines.ts`, `request-helpers.ts` | 53 | n/a |
| A (US-006, 007, 014) | three DOM rules with self-contained collectors | 71 | Accepted, no rework |
| B (US-008, 009, 013) | compression, cache headers (`cacheVerdict`), GIF | 66 | Accepted after R1 (performance test robustness) |
| C (US-011, 012) | domains, HTTP/2, `normaliseHttpVersion`, `startedAt`, legacy-load tests | 57 + 2 | Accepted after R1 (empty-scope grade, performance tests) |
| D1 (US-010 service) | streaming minification scanner, 7 reference fixtures, DevTools content adapter, dev fake, factory, context, wiring | 68 | Accepted, no rework |
| D2 (US-010 domain) | generic `WorkQueue`, content queue, `planContentAnalyses`, use-case wiring, `MinifyTextFiles` | 41 | Accepted, no rework |
| E (UI) | `file` lines with shortened names, "fichiers" progress | 10 | Accepted, no rework |
| Lead integration | registry (13 rules), timing-log cleanup, docs | 1 | n/a |

**Total:** 59 test files, 977 tests (baseline 42 files, 594 tests).

## 2. Quality gates

### Gate 1: TDD execution: PASS (with noted gaps)

- **Lead:**
  - Red recorded: "Failed to load url ./rule-lines", "./request-helpers"; 3 engine assertions (`expected undefined to deeply equal [ Array(2) ]`).
  - The registry test was red with 3 failures before registration.
- **A, B, C, D1, D2:** every new test file was red on load ("Failed to load url ./<module>") before its module existed.
  - D2 also recorded `planContentAnalyses is not a function` (3 failed).
  - C recorded `expected undefined to be '2'` (23 failed) on the HAR tests.
  - D1 recorded `factory.getContentAnalyser is not a function`.
- **E:** red recorded, 6 failures, e.g. `expected 'Estimation en cours… (2/5 images)' to be 'Analyse en cours… (2/5 fichiers)'`.
- **C, R1:** the two new empty-scope cases were red ("2 failed | 17 passed") before the fix.
- **Gaps:**
  - B was green on its first implementation run. Its red evidence is the load failure only; the assertions were written beforehand.
  - C's 2 store legacy-load tests passed immediately. They are regression guards by design: the codec needed no change.
  - The estimation-queue refactor is behaviour-preserving. It is covered by the unchanged `estimation-queue.test.ts` and both use-case test files, which were run before and after.

### Gate 2: Context isolation & security: PASS

- `vi.mock(` has 0 occurrences in `src`.
- `src/app/domain` imports neither `infra/` nor `ui/` (ESLint clean). The new port `ContentAnalyser` is injected like `ImageEstimator`, and `getContentAnalyser()` is called only from `index.tsx`.
- **No re-download (US-010 §5):** `createDevtoolsContentAnalyser` has no `fetch` dependency, and a test stubs `fetch` and asserts it is never called. Contents are released after each file and are not persisted; only measurements reach the domain.
- **Collectors:** the three collectors are self-contained; the registry rebuilds them from source (`new Function`) and checks JSON round-trip. The background bundle builds with the 13 rules, and has no DOM or `chrome` leak from `rule-lines.ts` / `request-helpers.ts`.
- **Persistence:**
  - `lineRefs`, `httpVersion` and `startedAt` are optional; analyses saved earlier load unchanged (tested). No codec change.
  - Permissions, CSP and the `gecko.id` (`bastienhub@gmail.com`) are unchanged.

### Gate 3: Reactive state standard: PASS

- **US-010 states:**
  - per file: `pending | analysed | not-evaluated(reason)`;
  - per rule: `progress { done, total, unit: "files" }` and no grade while any is pending; then a grade, or "Non évaluée" ("Contenu des fichiers non disponible") when nothing could be evaluated.
- **Updates and stop:**
  - Results update with no user action: the queue's `onChange` bumps the shared version, and closed pages are rebuilt (tested).
  - `stopAnalysis()` stops both queues and returns pages with `analysis-stopped` files (scenario 10, tested).
  - The adapter's `cancel()` uses a generation counter, so the session-wide analyser keeps working for the next analysis.
- **Scope:** the queues are per analysis; nothing is global except the memoised adapter, which is stateless between files.
- **Other rules:** the eight other rules are synchronous, as conventions §10 requires.

### Gate 4: UI & accessibility: PASS (code review; browser checks pending)

- File names in the new rules' lines render through the existing `ImageName`: the short name is `aria-hidden`, the full name is `sr-only` text and the `title`. Prefixes ("Vidéo ", "Iframe ", "Son ") and suffixes ("(JS, 250 ko) : …") are kept.
- Any mismatch, the "… et N autres" line, domain lines and legacy analyses fall back to plain text. The image lines and the comparison buttons are unchanged (tested).
- "Analyse en cours… (n/N fichiers)" uses the existing `role="status"`. The grade is never conveyed by colour alone ("Non évaluée" label).
- **Strings:**
  - The French strings match the stories, and the §2.1 B/C wordings confirmed by the owner.
  - Plural agreement is real (`plural`); digit grouping goes through `formatCount` / `formatKo`.

### Gate 5: Full suite integration: PASS

- `npm test`, three consecutive runs on a quiet machine: **59 files, 977 tests passed**, each time.
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors, 1 known warning (`browser-context.tsx`, pre-existing).
- `npm run build` (both targets): OK, `dist/chrome` and `dist/firefox` 6.2 MB each (unchanged).
- `npm run lint:firefox` was not run: `npx --yes web-ext` would download a package. It is in the manual checks.

## 3. Findings and rework

| # | Scope | Finding | Resolution |
|---|---|---|---|
| R1-C1 | C | `PreferHttp2` returned "Non évaluée" for a page with no network request, against EPIC-BP2 §2 ("nothing to check means A"). | Fixed: A with "Aucune requête réseau à vérifier"; unknown versions on real requests keep "Non évaluée" (scenario 7). Tested. |
| R1-B1, R1-C2 | B, C | The "2 000 requests < 10 ms" tests failed about once in three full runs. Isolated medians were 0.1 to 2.4 ms, so this was scheduling noise from parallel test files. | Fixed: one warm-up, then the best of 5 runs; budget unchanged. Best times: 1.7 to 6.5 ms under full load. |
| L1 | A, B | The performance tests printed timings with `console.info`. | Removed by the lead. |
| N1 | A | US-006/007/014 build placeholder lines `{ text: "" }` beyond the 20-line cap to skip URL parsing. This relies on `capLines` using the same `MAX_OFFENDER_LINES`. | Accepted: correct and commented. A lazy `capLines` overload would be cleaner later. |
| N2 | D1 | The Firefox base64 heuristic: content made only of base64 characters with a length that is a multiple of 4 is decoded. | Accepted per ARCH-DECISION-018. A real text file of ≥ 1 kB in that alphabet is practically impossible. |
| N3 | D1 | The `.js` fixtures contain UMD globals and would fail `no-undef` if linted explicitly. | Accepted: `npm run lint` is `--ext .ts,.tsx`. The fixtures are test data with a README of sources and licences (MIT). |

**Decisions taken by agents, accepted:**
- US-007 ignores every element whose URL is not `http(s)` (`about:blank`, `blob:`, empty src).
- US-009 parses HTTP dates with strict parsers for the three RFC formats. An invalid `Date` header falls back to `startedAt`.
- US-010 counts exactly 5 % as not minified ("minified when under 5 %"), and 5 000 000 bytes is still analysed.
- US-012 rounds 0.5 % up to "1 %".

## 4. Measurements

| Item | Measured | Budget |
|---|---|---|
| US-006 collect + evaluate, 2 000 elements (jsdom, best of 3) | 20–30 ms | 50 ms |
| US-007 collect + evaluate, 2 000 elements (jsdom) | 20–29 ms | 50 ms |
| US-014 collect + evaluate, 500 media (jsdom) | 5–15 ms | 20 ms |
| Request rules, `evaluate` on 2 000 requests (isolated median) | 0.1–2.4 ms | 10 ms |
| Minification scanner, 5 MB synthetic JS (Node, 256 Ki slices) | 48–52 ms total, about 2.5 ms per slice | 500 ms total, 50 ms per task |

**Reference fixtures** (removable share; the threshold is 5 %):

| Fixture | Share | Classification |
|---|---|---|
| `color.min.js` | 0.04 % | minified |
| `preflight.min.css` | 0.04 % | minified |
| `app.min.js` (licence + sourceMappingURL) | 0.04 % | minified |
| `color.esm.js` | 15.5 % | not minified |
| `preflight.css` | 62.7 % | not minified |
| `page.html` | 29.7 % | not minified |
| `design-tool.svg` | 32.4 % | not minified |

## 5. Follow-ups for the PO

1. **Aggregated domain lines (owner decision, 2026-10-20).** In a saved analysis, US-011/012 lines are per page, so a domain can repeat with different counts. Raise a story to merge them per domain.
2. **New wordings to confirm:**
   - US-009 "Cache-Control sans durée de cache" (a `Cache-Control` header with no decisive directive);
   - US-012 "Aucune requête réseau à vérifier" and "< 1 %";
   - US-008 suffix "(encodage non reconnu considéré comme compressé : …)";
   - US-010 not-evaluated lines "non évalué (<raison>)".
3. **US-013 size.** The decoded size is shown when the GIF came from the cache (transfer size 0), so its weight is stable across pages.

## 6. Manual checks (to do in Chrome ≥ 103 and Firefox ≥ 109)

- [ ] Load the built extension. The panel opens and the 13 rules are listed (categories Contenu, Images, Réseau…).
- [ ] US-006, US-007 and US-014 on a real page: alternatives, the lazy-loading fold at the real viewport, and autoplay.
- [ ] Real HAR values: `content-encoding` present in both browsers' entries; `httpVersion` values (`h2`, `h3`, `HTTP/2`) normalised.
- [ ] US-010 on a site with large bundles: "Analyse en cours… (n/N fichiers)" then a grade, with no panel freeze.
- [ ] US-010: no new request in the Network panel while contents are analysed. "Stopper l'analyse" while pending gives "analyse arrêtée".
- [ ] A saved analysis from before this version opens unchanged.
- [ ] `npm run lint:firefox` on `dist/firefox`.

## 7. Verdict

All five gates pass. Every story's Gherkin scenarios are covered by automated tests; the browser-only behaviours are listed in §6.

Stories US-006, US-007, US-008, US-009, US-010, US-011, US-012, US-013 and US-014: **DONE** (pending the manual checks of §6).

Status: APPROVED
