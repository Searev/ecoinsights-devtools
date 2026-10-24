# ARCH-DECISION-026: Line-structure minification heuristic and declared builds

- **Status:** Accepted
- **Story:** US-021
- **Amends:** ARCH-DECISION-018. The scanner contract, policy and analyser scheduling stay; only the heuristic and the file scope of content jobs change.

## Context

The US-010 scanner is a character-level state machine for strings, template literals, block, line and HTML comments, and kept-comment detection.

On real minified JavaScript, it cannot recognise regular expression literals: `/["']/` opens a string that never closes where it should. From then on, code and strings are swapped. A later `"*/*"` or `"http://…"` is read as a comment, and the rest of the file can be counted as removable. Mid-line whitespace inside strings adds noise, and tiny files are flagged for gains of a few dozen bytes.

The owner decided (US-021):

1. `*.min.js`, `*.min.mjs` and `*.min.css` are minified by declaration;
2. only whitespace from the line structure counts;
3. a flagged file must also have at least 1 000 removable characters.

## Decision

1. **No parsing.** `domain/text-content/minification.ts` becomes a tiny line-structure scanner, with no notion of string, comment or language.
   - It counts every `\n` and `\r`, the leading run of each line, and the trailing run before a line break or the end of the text.
   - Its whitespace characters are only space, tab and form feed.
   - **State:**
     - `atLineStart`: no non-whitespace character yet on the current line;
     - `pendingRun`: whitespace characters since the last non-whitespace character on the current line.
   - **Transitions:**
     - A line break adds `pendingRun + 1`, then resets `pendingRun` and sets `atLineStart`.
     - The first non-whitespace character of a line adds `pendingRun` (indentation) and clears `atLineStart`.
     - Any other non-whitespace character drops `pendingRun` (a mid-line run).
     - `result()` adds the current `pendingRun`, as trailing whitespace at the end of the text, without changing the state.
   - Chunking invariance is natural, since no lookahead is needed. `CRLF` split across chunks still counts 2.
   - **API:** `createMinificationScanner()` and `measureMinification(text)` **lose their `type` parameter**, because the heuristic is language-independent. `ContentJob.type` stays, for lines and previews.
2. **Declared builds** are decided in the rule, not the adapter.
   - `isDeclaredMinified(url: URL)` goes in `rules/request-helpers.ts`. It tests the last path segment, lower-cased, against `DECLARED_MINIFIED_SUFFIXES` (`.min.js`, `.min.mjs`, `.min.css`) in `domain/text-content/policy.ts`.
   - `contentAnalyses()` never emits a job for a declared file.
   - `evaluate()` counts declared files as evaluated and minified before looking at content states, so the size cap and missing content don't apply to them.
3. **Floor in the rule.**
   - The policy gets `MIN_REMOVABLE_CHARACTERS = 1_000`.
   - Offender is `removableShare ≥ MINIFIED_MAX_REMOVABLE_SHARE && removableCharacters ≥ MIN_REMOVABLE_CHARACTERS`.
   - The analyser still returns raw measurements; thresholds stay in the rule, as in ARCH-DECISION-018.
4. **Wording unchanged.**
   - The line keeps `(~N % d'octets superflus)`, so `MINIFY_OFFENDER_END` (ARCH-DECISION-024) and saved analyses need no change.
   - Saved analyses are not re-graded.

## Consequences

- **Fewer false positives.**
  - Minified code can't be mis-parsed, because nothing is parsed.
  - Declared builds cost no DevTools read.
  - Small gains are no longer reported.
- **Accepted false negatives:**
  - a file whose bloat is mostly comments on long lines;
  - a misnamed `*.min.js` that is not minified.
- **Accepted approximations:** whitespace inside multi-line template literals and `<pre>` is counted.
- **Tests:** the comment and string tests of `minification.test.ts` are replaced by line-structure tests, plus a regression for parser drift. The US-010 fixtures still classify correctly. The TL measured new shares: 0.2 %, 0.0 % and 0.0 % for the minified fixtures, and 15.5 %, 7.2 %, 23.0 % and 19.5 % for the others.
- The scanner is simpler and faster; the 5 MB performance test stays.
