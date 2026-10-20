# Epic BP2: nine new best practices, shared conventions

These rules apply to stories **US-006 to US-014**. Each story only states what differs.

## Stories

| Story | Best practice (UI name, French) | Rule id | Data source |
|---|---|---|---|
| US-006 | Fournir une alternative textuelle aux contenus multimédias | `ProvideTextAlternatives` | page (DOM) |
| US-007 | Utiliser le chargement paresseux | `UseLazyLoading` | page (DOM) |
| US-008 | Compresser les fichiers textuels | `CompressTextFiles` | requests (headers) |
| US-009 | Ajouter des entêtes Expires ou Cache-Control | `AddCacheHeaders` | requests (headers) |
| US-010 | Minifier les fichiers CSS, JavaScript, HTML et SVG | `MinifyTextFiles` | requests (content) |
| US-011 | Limiter le nombre de domaines servant les ressources | `LimitDomains` | requests |
| US-012 | Privilégier HTTP/2 à HTTP/1 | `PreferHttp2` | requests (protocol) |
| US-013 | Limiter l'utilisation des GIFs animés | `LimitGifs` | requests |
| US-014 | Éviter la lecture et le chargement automatique des vidéos et des sons | `AvoidMediaAutoplay` | page (DOM) |

The stories are independent and can be delivered in any order.

- **US-012** extends the request model with the HTTP version.
- **US-010** needs response contents.

These two are the only ones touching infrastructure.

## Grading conventions

1. **Per page.** Every rule is evaluated per recorded page, like the existing rules. Results are persisted with the analysis.
2. **Nothing to check means A.** A page with no element or file in the rule's scope is graded **A**, with a detail saying so, for example "Aucune vidéo ni aucun son sur la page".
   - Exception: when items exist but **none could be evaluated**, the rule shows **"Non évaluée"**: no grade, with a reason. US-010 and US-012 can be in this situation.
3. **The worst grade wins.** When several conditions match, **C takes precedence over B**, and B over A.
4. **Rule model.** Each rule is a `BestPracticeRule` in its own file, registered in `RULES` (ARCH-DECISION-004 and 007):
   - DOM checks go in a self-contained `collect()`;
   - request checks read `RuleContext.requests`;
   - `evaluate()` stays pure and synchronous.
5. **Offender lines.**
   - **Order:** the most significant first: largest size, then URL order.
   - **Limit:** 20 lines, then "… et N autres".
   - **File names:** use the US-004 display name (shortened, full name on hover).
6. **Third-party resources** (analytics, CDNs, ads) are included. The auditor reports them even if the site owner does not control them directly.
7. **Scope of the DOM.** `collect()` runs in the **top frame only**, so elements inside iframes are not inspected. Request-based rules see every request DevTools records, iframes included.
8. **Request filters.**
   - Only `http(s)` URLs are considered; `data:` and `blob:` are already filtered out.
   - Responses with status `304 Not Modified` have no body: they count for header rules (US-009) but not for content rules (US-008, US-010).
9. **Units and wording.** 1 kB = 1 000 bytes ("ko"). UI strings in French exactly as written in the stories.
10. **Data states.** These rules are synchronous, except US-010 (content). They are evaluated whenever the page is evaluated: there is no `loading` state except the one US-010 defines.
11. **Legacy analyses.** Analyses saved before this epic simply don't list the new rules. Their stored results are never recomputed.
