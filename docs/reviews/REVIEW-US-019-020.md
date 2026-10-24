# REVIEW-US-019-020: small GIFs ignored; preview of a non-minified text file

- **Plan:** [TECH-US-019-020-plan.md](../architecture/TECH-US-019-020-plan.md)
- **Stories:** [US-019](../stories/US-019.md) (epic BP2), [US-020](../stories/US-020.md) (epic [PV](../stories/EPIC-PV-conventions.md))
- **Decisions:** ARCH-DECISION-024 (amends 020 and 022) and 025.
- **Branch:** `feat/best-practices-bp2` (uncommitted working tree, on top of the uncommitted US-006 to US-018 work)
- **Reviewer:** team lead
- **Date:** 2026-10-23

## 1. Delivery summary

| Scope | Content | Tests (files of the scope) | Result |
|---|---|---|---|
| Lead contract | `TextPreviewType`, `LinePreview` `text`, `TextPreviewSubject`, `PreviewTextInfo`, `loadText` / `text` / `peekText`, `MAX_PREVIEW_TEXT_CHARS`, legacy minification lines from their text, `syntax-types.ts` | +11 | n/a |
| A (US-019, refs) | `MIN_COUNTED_GIF_BYTES`, grade on counted GIFs, ignored-GIF mention; `MinifyTextFiles` offender refs; the view passes the line text to the resolver | +16, 4 tests adapted | Accepted, no rework |
| B (bytes) | `loadText`: DevTools content (base64, Firefox base64, text), else re-download with the response charset; dev samples | +26 | Accepted, no rework |
| C (colouring) | in-house line tokenizers (JavaScript, JSON, CSS, markup with embedded script and style), `createLineHighlighter`, palette | 117 in 7 files | Accepted, no rework |
| D (model) | `decodePreviewText`, `countLines`, `prepareTextDocument`; strings and info rows; `createTextPreviewController` | 44 in 3 files | Accepted, no rework |
| E (renderer) | `renderTextView` (rows, time slices, colouring, cancel), source safety scan | 25 in 2 files | Accepted after lead fix L1 |
| F (wave 2) | `TextPreviewBody`, `text-view.css`, dialog host `<Match>` | 17 | Accepted, no rework |
| Lead integration | timing tests made robust (N1), docs | n/a | n/a |

**Total:** 90 test files, 1 600 tests (baseline 77 files, 1 334 tests; after the contract wave, 77 files and 1 345 tests).

## 2. Quality gates

### Gate 1: TDD execution: PASS (with noted gaps)

- **Lead contract.** 10 failures recorded before implementation, e.g. `legacyLinePreview … expected undefined to deeply equal { kind: 'text', type: 'CSS' }` and `Target cannot be null or undefined` (no `texts` on the fake loader).
- **A:** 9 failures in `limit-gifs` (`expected 'C' to be 'A'` for scenario 2), 2 in `minify-text-files`, 2 in the view (`… to match object { preview: { kind: 'text', …(2) } }`).
- **B:** 16 of 38 loader tests and 10 of 13 fake tests failed on the stubs (`expected 'error' to be 'loaded'`).
- **C:** every file failed to load first; two later red-to-green cycles on behaviour (palette distance; a template literal across lines).
- **D, E, F:** each test file was red on load before its module existed. E also had assertion failures in the safety scan before the renderer existed.
- **L1:** the lead's regression test was red (`RangeError: Maximum call stack size exceeded`) before the fix.
- **Gaps:** D's and F's red evidence is load failures only; their assertions were written first and were green on the first implementation run.

### Gate 2: Context isolation & security: PASS

- **Isolation:**
  - `vi.mock(` has 0 occurrences in `src`.
  - `src/app/domain` imports neither `infra/` nor `ui/` (ESLint clean). The resolver reuses `contentTypeCharset` from the domain's `request-helpers.ts`.
  - The text path reuses the injected `PreviewFileLoader` and `PreviewFileStore`; no new port, protocol entry, permission or Page agent call.
- **US-010 is unchanged:** the grade still reads DevTools content only (ARCH-DECISION-018); the re-download is in the preview loader, used for display only.
- **Hostile content (US-020 S8):**
  - The file text enters the DOM through `createTextNode` and `textContent` only. Token kinds become class names.
  - `text-view-renderer.test.ts` renders five hostile strings, with and without a highlighter: no `script`, `img`, `style`, `a`, `iframe`, `link` or `object` element is ever created, and each row's text equals its line.
  - The tokenizers keep their invariant (tokens join to the line, nothing throws) on the hostile fixtures and on a seeded fuzz of 2 000 random lines per language.
  - `text-safety.test.ts` scans every non-test text-preview and syntax source file for `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser`, `createContextualFragment`, `document.write`, `eval(` and `new Function`. It finds none, and a lead grep of `preview/` and `infra/file-preview/` agrees.
- **CSP** is unchanged; `scripts/manifest.test.mjs` passes (13 tests). Colours are classes and custom properties; no `<style>` element is injected.
- **Library constraints:** no dependency was added. The tokenizers are in-house (ARCH-DECISION-025), bundled, and loaded through `import("./syntax")` only.
- **Persistence:** only `LineRef.preview` (`{ kind: "text", type }`) on offender lines. Contents are never persisted; older analyses load unchanged.
- **Placeholder email** `bastienhub@gmail.com` is unchanged.

### Gate 3: Reactive state standard: PASS

- `createTextPreviewController` has `idle | loading | loaded | error(unavailable | too-large)` states and is tested without the DOM (12 tests).
  - A cached file (`peekText`) opens `loaded` at once, without `loading` (S13).
  - A late result after close, or for an older opening, is ignored, and still fills the cache (S13).
  - "Réessayer" works only in `error` and reloads for real, because errors are never cached (S6).
  - An empty content is `loaded` with 0 lines (S14).
- The renderer's lifecycle is explicit: a synchronous first slice, then time slices; `cancel()` on cleanup and before a re-render; `settled` never rejects.
- Colouring failures (a rejected chunk import, a throwing line, a token mismatch) stop colouring silently and leave plain text (S10).

### Gate 4: UI & accessibility: PASS (code review; browser checks pending)

- The body follows epic §2 to §7 in the shared dialog. The header (short name, full URL) is the host's.
- Information list: "Type" (`CSS`, `JavaScript`, `HTML`, `SVG`, `JSON`), "Poids" (`formatKo`), "Lignes" (`formatCount`).
- The cap notice `Affichage limité aux 500 premiers ko (fichier de 1 234 ko).` is shown above the block; "Fichier vide." replaces an empty block.
- **Content block:**
  - `role="region"`, `tabindex="0"`, `aria-label="Contenu du fichier"`, with a visible focus outline;
  - `max-height: 55vh`, vertical scroll only (`overflow-x: hidden`);
  - lines `pre-wrap` with `overflow-wrap: anywhere`; one row per line, so a wrapped line keeps one number (S9).
- **Line numbers:** `aria-hidden`, `user-select: none`, and drawn by `::before { content: attr(data-line) }`. They have no text node, so they are never copied.
- **Colours:**
  - the palette is tested at ≥ 4.5:1 against `#282828` (lowest: gutter 5.24, selector and tag 5.15);
  - comments are green and italic, so they do not rely on colour alone.
- **States:** loading uses `role="status"` ("Chargement du fichier…"); errors use `role="alert"` with "Réessayer".
- **Lazy chunk:** the tokenizers build into a separate 11.4 kB chunk (`assets/index-2262c20b.js`, 4.1 kB gzip) in both targets. The main chunks do not contain them.

### Gate 5: Full suite integration: PASS

- `npm test`: **90 files, 1 600 tests passed**, six consecutive runs after N1.
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors, 1 known warning (`browser-context.tsx`, pre-existing).
- `npm run build` (both targets): OK, zips produced.
- `npm run lint:firefox` was not run, because `npx --yes web-ext` would download a package. It is in the manual checks.

## 3. Findings and rework

| # | Scope | Finding | Resolution |
|---|---|---|---|
| L1 | E | The colouring pass called `codeSpan.replaceChildren(...nodes)`. A line with several hundred thousand tokens exceeds the engine's argument limit, so it threw outside the `try`, in a scheduled task. | Fixed by the lead: tokens go into a `DocumentFragment`, then `replaceChildren(fragment)`. A regression test (300 000 tokens on one line) was red with `RangeError`, then green. |
| N1 | suite | The pre-existing wall-clock tests ("2 000 requests in under 10 ms", "2 000 elements within budget" < 50 ms) failed in 2 of 5 full runs, **even without the new test files**, and in 2 of 3 with them. Failures were close to the budget (e.g. 59.6 ms against 50 ms), and moved from file to file. | Made robust by the lead: these timing loops take the best of 10 measurements instead of 3 or 5. The budgets are unchanged. Six full runs were then green. |
| N2 | B | Firefox content without an encoding that happens to be entirely base64-shaped is decoded as base64, as in the US-010 analyser. | Accepted: the same content is read the same way by the grade and the preview; real CSS, JS, HTML and SVG files of 1 kB or more contain other characters. |
| N3 | C | Tokenizer heuristics: a regex right after `)` is read as a division; a nested CSS selector is recognised only when its `{` is on the same line; entities stay plain; a quoted attribute value spanning lines includes the next line's indentation. | Accepted (best effort, ARCH-DECISION-025); the text is always exact. |
| N4 | C | Some token kinds share a colour across languages (`string` / `attr-value`, `tag` / `selector`, `property` / `attr-name`). | Accepted: they never appear in the same language, except in an embedded `<style>`. |
| N5 | E | A single line of a whole 500 kB file is coloured in one task. | Accepted (ARCH-DECISION-025): non-minified files have many lines by definition. |

**Decisions taken by agents, accepted:**
- **A:** the US-019 detail hard-codes "5 ko", next to the 5 000-byte constant.
- **B:** an `encoding` other than `"base64"`, including Chrome's `""`, is text.
- **C:** adjacent tokens of the same kind are merged; `${ … }` inside templates is tokenized as code; `importmap`, `speculationrules` and JSON script types use the JSON highlighter.
- **D:** a cut that lands between `\r` and `\n` adds no phantom row.
- **F:** the focus outline is `2px solid #9cdcfe`.

## 4. Lead decisions (plan §2) to confirm with the owner

1. **US-019:** `MIN_COUNTED_GIF_BYTES` lives in `domain/image-estimation/policy.ts`.
2. **"Lignes":** `"a\nb\n"` counts 2 lines (a final break adds no line); an empty file has 0.
3. **Cap notice:** the file size in "(fichier de … ko)" is "Poids", the byte length, and not the number of characters. The two are equal for ASCII files.
4. **"Poids" of DevTools text content:** the UTF-8 length of the decoded text that DevTools gives. It can differ slightly from the transferred body for a non-UTF-8 file.
5. **"Type":** `JavaScript` for `JS` lines.
6. **Themes:** the panel has a single dark theme, so there is one palette, tested against it. The story's "light and dark themes" requires a light palette only when the panel gets a light theme.
7. **Empty content:** the information list is still shown ("Poids : 0 ko", "Lignes : 0").
8. **Legacy minification lines** are recognised from the end of their text (ARCH-DECISION-024). If US-010 changes its wording, the pattern must follow.

## 5. Manual checks (to do in Chrome ≥ 103 and Firefox ≥ 109)

- [ ] **US-019:** a page with a tracking-pixel GIF and an animated GIF shows B, one line, and "(1 GIF de moins de 5 ko ignoré)". A page with only pixels shows A with "Aucun fichier GIF de 5 ko ou plus (…)". A saved analysis keeps its old grade.
- [ ] **US-020, opening:** a non-minified CSS, JS, HTML and SVG file opens from "Minifier les fichiers CSS, JavaScript, HTML et SVG". A "non évalué" line is plain text. Escape, the backdrop and "Fermer" close the dialog, and focus returns to the name.
- [ ] **Colours:** comments, strings, numbers and keywords in JS; tags, attributes and comments in HTML and SVG; selectors, properties and values in CSS. Comments are italic and readable.
- [ ] **Sources:** a file loaded before the recording opens from the HTTP cache. An unreachable file shows "Fichier indisponible.", then "Réessayer".
- [ ] **Hostile file:** an HTML file with `<script>alert(1)</script>`, `<img src=x onerror=…>` and `</pre><style>body{display:none}</style>`. No script runs, there is no request for `x` (Network panel of DevTools-on-DevTools), and the panel's styles are unchanged.
- [ ] **Text layout:** selecting and copying excludes the line numbers. A long line wraps with one number. There is no horizontal scroll, and the header and information list stay visible.
- [ ] **Charset:** an `iso-8859-1` CSS file with "é" displays correctly.
- [ ] **Large file:** a 1 MB file shows the cap notice, the plain text appears quickly, and the panel stays responsive while colouring.
- [ ] **Lazy chunk:** the tokenizer chunk is requested only when the first text preview opens.
- [ ] **Saved analysis:** an analysis saved before US-020 has clickable offender lines.
- [ ] `npm run lint:firefox` on `dist/firefox`.

Status: APPROVED (automated gates; manual browser checks pending)
