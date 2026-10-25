# Epic BP3: four new best practices

These stories follow **every convention of [EPIC-BP2](EPIC-BP2-conventions.md)**: per-page grading, "the worst grade wins", the rule model, offender lines (20 lines, then "… et N autres"), the top frame only for the DOM, units and wording, synchronous evaluation, and legacy analyses not being recomputed. Each story only states what differs.

The numbering starts at US-024, because US-022 and US-023 (impact models) live on the `feat/impact-models-co2js` branch.

| Story | Best practice (UI name, French) | Rule id | Category | Data source |
|---|---|---|---|---|
| US-024 | Externaliser les CSS et JavaScript | `ExternalizeCssJs` | `js` | page (DOM) |
| US-025 | Limiter le nombre de requêtes HTTP | `LimitRequests` | `network` | requests |
| US-026 | Limiter le nombre de fichiers CSS | `LimitCssFiles` | `css` | requests |
| US-027 | Limiter l'utilisation des éléments canvas | `LimitCanvas` | `content` | page (DOM) |

## Shared rules for this epic

- **Collector failure (DOM rules, US-024 and US-027):** when `collect()` fails, the rule is **"Non évaluée"**. It has no grade, and its detail is "La page n'a pas pu être inspectée". This follows EPIC-BP2 §2. The legacy `PrintStyleSheet` rule, which grades A in that case, is not a model.
- **Exact thresholds:** the boundaries in each story are inclusive exactly as written. Each story has a Gherkin scenario on every boundary.
- **Independence:** the four stories touch no shared file except `RULES` (`index.ts`) and the README table of rules, so they can be built in parallel.
