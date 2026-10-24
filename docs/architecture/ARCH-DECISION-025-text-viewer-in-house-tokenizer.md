# ARCH-DECISION-025: The text viewer colours with an in-house, line-based tokenizer loaded lazily, and builds its DOM from text nodes in time slices

- **Status:** Accepted (US-020)
- **Builds on:** [ARCH-DECISION-021](ARCH-DECISION-021-app-dialog-host.md) (one body per preview kind), [023](ARCH-DECISION-023-media-and-font-previews-csp.md) (CSP unchanged)

## Context

US-020 shows the raw content of a non-minified CSS, JavaScript, HTML or SVG file (and JSON, for later rules), up to 500 000 characters. It needs:

- line numbers in a gutter, which are not selected or copied and are hidden from screen readers;
- long lines that wrap with a single line number, and no horizontal scroll;
- best-effort colouring of comments, strings, numbers, keywords, tags, attributes, selectors, properties, values, JSON keys and literals. Comments must stand out. The text contrast must be at least 4.5:1;
- colouring that never blocks: on failure, or for an unknown language, the text stays plain without an error;
- plain text of a 500 kB file visible within 300 ms, and no colouring task over 100 ms;
- **safety**: hostile content (`</pre><script>`, `<img onerror>`, `<style>`) is never interpreted;
- the stories' constraints on a library: bundled, permissive licence, no `eval` / `new Function`, no CSP relaxation, output from escaped text nodes or spans rather than the `innerHTML` of file content, and preferably lazy-loaded.

Options considered for colouring:

1. **highlight.js** (BSD-3). Its API returns an HTML string, so the page would need `innerHTML` of a string that contains the file content. It escapes correctly, but the story discourages that pattern, and its common bundle is about 100 kB.
2. **Prism** (MIT). `Prism.tokenize` returns a token tree, so no HTML is needed. But its core auto-highlights the document and listens for worker messages unless configured otherwise, its language definitions extend a global, and it does not resume across lines. Chunking would mean tokenizing the whole 500 kB text in one task.
3. **Lezer** (`@lezer/javascript`, `css`, `html`, `json`; MIT). These are real incremental parsers, but they add five dependencies and about 150 kB, for colouring that is best effort by definition.
4. **An in-house, line-based tokenizer per language (chosen).**
   - Each language is a small state machine that carries its state across lines: open comment, string, template literal, tag, embedded `<script>` or `<style>`.
   - It has no dependency, no licence question, no global and no `eval`, and it runs under the current CSP.
   - Its output is a list of `{ text, kind? }` per line, which maps one to one onto the viewer's rows.
   - Being line-based, it can be resumed between time slices. The renderer colours a few hundred lines per slice and yields.
   - It is pure and fully unit-tested, including hostile fixtures and the invariant that the tokens of a line, joined, equal the line.

Options considered for rendering:

1. **A Solid `<For>` over lines and tokens.** Rejected: building tens of thousands of nodes in one reactive pass blocks the panel, and the behaviour would sit in a `.tsx` file, which this project does not test.
2. **One `<pre>` with a separate gutter.** Rejected: wrapped lines break the alignment between numbers and lines.
3. **An imperative renderer in a tested `.ts` module (chosen)**, `renderTextView(container, lines, options)`:
   - **Rows.** One row per line: a gutter `span` with `aria-hidden="true"` and a `data-line` attribute, shown with CSS `::before { content: attr(data-line) }` so it is never selected or copied; then a code `span` (`white-space: pre-wrap; overflow-wrap: anywhere`).
   - **Text only.** Every piece of file text enters the DOM through `createTextNode` or `textContent`. Token kinds become class names (`syntax-<kind>`). No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `DOMParser` or `createContextualFragment` appears in the text preview or syntax code; a source-scanning test enforces it.
   - **Plain pass, then colours.** The first time slice appends rows synchronously, so the top of the file shows at once; the remaining rows follow in time slices (`schedule`, `now` and the slice budget are injected). The colouring pass then replaces each row's text node with token spans, in slices too. Plain text comes first, colours after.
   - **Failures.** If loading the tokenizer fails, a line throws, or its tokens do not join to the line, colouring stops and the rest stays plain, without an error.
   - **Cancellation.** `cancel()` stops every pending slice; the body calls it on cleanup.
- **Lazy loading.** `ui/analysis/preview/syntax/index.ts` (`createLineHighlighter`) is imported only through a dynamic `import()` from the text body, so Vite emits it as a separate chunk loaded on the first text preview. The types and the palette (`syntax-types.ts`, `syntax-palette.ts`) are tiny and imported statically.
- **Colours.**
  - `syntax-palette.ts` holds one colour per token kind, and the text and gutter colours, for the panel's theme. A test checks that each has a contrast of at least 4.5:1 against the content background.
  - The body sets them as CSS custom properties (`--syntax-<kind>`) on the content block, and `text-view.css` maps each class to its property.
  - Comments are also italic, so they do not rely on colour alone.
  - The panel has a single, dark theme today (see the review); a light palette would be a second set of the same properties.
- **CSP.** Unchanged: the renderer injects no `<style>` element, and colours are classes and custom properties on an element. `scripts/manifest.test.mjs` keeps passing.

## Consequences

- The tokenizers are heuristics. JavaScript regex detection depends on the previous significant token, template literals with nested `${}` across lines are approximated, and a CSS value split across lines may lose its colour. This is accepted as best effort; the text is always exact.
- A single extremely long line (a whole 500 kB file on one line) is coloured in one task, which may take longer than one slice. This is acceptable for non-minified files, which by definition have many lines.
- The viewer can serve later text previews (for example US-008 compression) with a new body or by reusing this one.
- About 15 kB of tokenizer code is loaded only when a text preview first opens.
