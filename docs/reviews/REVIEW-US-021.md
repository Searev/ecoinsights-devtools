# Review: US-021, fewer false positives in the minification rule

- **Story:** [US-021](../stories/US-021.md)
- **Plan:** [TECH-US-021-plan.md](../architecture/TECH-US-021-plan.md)
- **Decision:** [ARCH-DECISION-026](../architecture/ARCH-DECISION-026-line-structure-minification-heuristic.md)
- **Reviewer:** tech lead
- **Status: APPROVED** (automated gates passed; manual browser check pending, see §3)

## 1. Quality gates

| Gate | Result |
|---|---|
| TDD | The tests were rewritten first and run red: 20 failures across the scanner, `isDeclaredMinified` and the rule. They are now green. |
| Context isolation | No protocol, port or persisted-model change. The scanner stays pure and in the domain; the thresholds stay in the rule (ARCH-DECISION-018 §heuristic). |
| Reactive state | Unchanged. Declared files never enter the content queue, and progress counts only the files that are measured. |
| UI | No UI change. The line wording is unchanged, so `MINIFY_OFFENDER_END` (ARCH-DECISION-024) still matches saved lines. |
| Full suite | `npm run typecheck`: clean. `npm run lint`: 0 errors, plus the known warning in `browser-context.tsx`. `npm test`: 90 files, 1 607 tests passed. `npm run build`: Chrome and Firefox built. The reviewer re-ran all four. |

## 2. Code review notes

- **`minification.ts`:**
  - Two state variables, with no lookahead, so chunking invariance holds by construction. CRLF counts 2, as specified.
  - `result()` adds the pending run without mutating the state.
- **`minify-text-files.rule.ts`:**
  - `evaluated` starts at the number of declared files. A page with only declared files and "non évalué" files is graded A, with the "(N fichiers non évalués)" suffix. This is consistent with scenario 4 and accepted.
  - The `evaluated === 0` branch ("Contenu des fichiers non disponible") now applies only when no declared file exists.
- **`isDeclaredMinified`** reads the last path segment, as `pathExtension` does. The query and fragment are excluded, because `URL.pathname` holds neither.
- **Fixture rename in rule tests:** the existing tests that used `app.min.js` and `style.min.css` as *measured* files now use `app.js` and `style.css`. Their intent is preserved.

## 3. Manual checks pending

- On a real site with a jQuery `*.min.js?ver=` (for example WordPress) and an unminified theme CSS: the `.min` files are not listed, and the theme CSS is listed if it has at least 1 ko of indentation.
- On a site whose minified bundle was previously flagged (the parser-drift case): it is no longer flagged.
