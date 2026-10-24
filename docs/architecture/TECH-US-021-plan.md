# [TECH-PLAN] US-021: Fewer false positives in the minification rule

Story: [US-021](../stories/US-021.md). Decision: [ARCH-DECISION-026](ARCH-DECISION-026-line-structure-minification-heuristic.md), which amends ARCH-DECISION-018.

## 1. Contract

There is no protocol, port or persisted-model change. These are the changes:

```ts
// src/app/domain/text-content/policy.ts (additions)
/** US-021: file names declaring a minified build; never measured, always minified. Lower case. */
export const DECLARED_MINIFIED_SUFFIXES: readonly string[] = [".min.js", ".min.mjs", ".min.css"];
/** US-021: a file is flagged only with at least this many removable characters (1 ko). */
export const MIN_REMOVABLE_CHARACTERS = 1_000;

// src/app/domain/text-content/minification.ts (signature change: no type parameter)
export function createMinificationScanner(): MinificationScanner;
export function measureMinification(text: string): MinificationResult;

// src/app/domain/best-practices/rules/request-helpers.ts (addition)
/** US-021: last path segment (query and fragment ignored) ends with a declared suffix, case-insensitive. */
export function isDeclaredMinified(url: URL): boolean;
```

`MinificationResult`, `ContentJob`, `ContentOutcome` and the `ContentAnalyser` port are unchanged.

## 2. Scope for sub-agent 1 (single agent, strict TDD)

### 2.1 Scanner (`domain/text-content/minification.ts`)

Rewrite it as described in ARCH-DECISION-026 §1.
- Whitespace is `' '`, `'\t'`, `'\f'`; line breaks are `'\n'` and `'\r'`, each counted as 1.
- Keep the file header comment style; update it to describe the new heuristic and cite US-021.
- **Tests,** in `minification.test.ts`, rewritten first and red:
  - Delete the comment and string tests; they no longer apply.
  - Line-structure cases:
    - `"a {\n    color: red;  \n}\n"` → 24 / 9;
    - `"var a    =    1;"` → 0;
    - `"a\r\n\t\t\r\nb"` → 6;
    - leading run on the first line (`"   a"` → 3);
    - trailing run at end of text (`"a   "` → 3);
    - whitespace-only text (`"  \n "` → 4);
    - empty text → 0 / 0;
    - a single-line text full of `/* */` comments → 0.
  - Parser-drift regression (story scenario 12): a single-line JS mixing `/["']/`, `"*/*"`, `"http://x"`, `//` and `/*` in strings has 0 removable, or 1 with a final `\n`.
  - Keep and adapt `result()` at any time, chunking invariance at every split position, char-by-char, the random-split property over every fixture, and a CRLF split across chunks.
  - Fixtures (story scenario 11): keep both lists and the "≥ 3 kB / 2 kB" test. Replace the "licence header kept" test with one stating `app.min.js` has at most 3 removable characters.
  - Keep the 5 MB performance test.

### 2.2 Analyser (`infra/content-analyser/devtools-content-analyser.ts`)

- Call `createMinificationScanner()` without the type.
- Nothing else changes: slicing, yielding, base64 and charset handling stay.
- Adapt its tests and `fake-content-analyser.test.ts` only where they pass a type, or rely on comment counting, to the scanner.
- Check `src/app/infra/content-analyser/fake-content-analyser.ts` for scanner use.

### 2.3 Declared names (`rules/request-helpers.ts`, `text-content/policy.ts`)

- Add the two constants and `isDeclaredMinified(url)`. Read the segment with `url.pathname.split("/").pop()`, the same way `pathExtension` does, lower-cased.
- **Tests** in `request-helpers.test.ts`:
  - **True for:**
    - `/js/jquery.min.js?ver=3.7.1`
    - `/Bootstrap.MIN.CSS`
    - `/app.min.mjs#x`
  - **False for:**
    - `/app-min.js`
    - `/app.minified.js`
    - `/min.js`
    - `/app.min.4f3a2c.js`
    - `/icon.min.svg`
    - `/dir.min.js/file.js`
    - `/`

### 2.4 Rule (`rules/minify-text-files.rule.ts`)

- **`filesInScope`:** unchanged scope. Mark each file `declared: isDeclaredMinified(request.url)`.
- **`contentAnalyses`:** skip declared files, as well as files over `MAX_CONTENT_BYTES`.
- **`evaluate`:**
  - Declared files are `evaluated++` and never offenders, pending or skipped, whatever their size or content state.
  - The pending/progress computation only considers non-declared files. `progress.total` is the number of non-declared files, and progress is absent when every file is declared.
  - A measured file is an offender iff `share >= MINIFIED_MAX_REMOVABLE_SHARE && state.removableCharacters >= MIN_REMOVABLE_CHARACTERS`.
- **Unchanged:** grades, details, line texts, sort order (`share × size`), the `{ kind: "text", type }` preview on offender lines, and `capLines`.
- **Tests** in `minify-text-files.rule.test.ts`, red first, mapping story scenarios 1–5 and 10 at rule level:
  - declared files produce no `ContentJob`;
  - a page with only declared files, with no contents, or over 5 MB, gives A "Tous les fichiers CSS, JavaScript, HTML et SVG sont minifiés" with no lines;
  - mixing declared and pending files shows progress over the non-declared ones only;
  - floor boundaries: 999 → minified, 1 000 at ≥ 5 % → offender, 600 at 20 % → minified;
  - adapt existing tests whose fixtures relied on fewer than 1 000 removable characters, or on comments.

### 2.5 Docs

- **`docs/stories/US-010.md`:** add a note at the top of "Minification heuristic" saying it is superseded by US-021. Leave the rest, for history.
- **`docs/architecture/ARCH-DECISION-018-text-content-analysis.md`:** add one "Amended by ARCH-DECISION-026" line under the heuristic bullet.
- **`docs/architecture/ARCHITECTURE.md`:** amend §3.7 point 3 (Minification) in one or two sentences.
- **`README.md`, in French:**
  - line 77: «part d'espaces superflus (indentation, fins de ligne, retours à la ligne ; ≥ 5 % et ≥ 1 ko) dans le contenu capturé ; les fichiers `.min.js`, `.min.mjs` et `.min.css` sont considérés comme minifiés»;
  - check line 254 and the text around it for comment mentions.
- **`CHANGELOG.md`:** add an entry under the current unreleased section, in the existing style.
- **`docs/stories/US-021.md`:** set Status to DONE when the gates pass.

### Gates

`npm run typecheck`, `npm run lint` (0 errors), `npm test` (all green), `npm run build`.

## 3. Out of scope

- No UI change.
- No protocol or persisted-model change.
- No change to US-020 or ARCH-DECISION-024. `MINIFY_OFFENDER_END` keeps matching, because the wording is unchanged.
