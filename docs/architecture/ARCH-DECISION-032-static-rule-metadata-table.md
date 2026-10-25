# ARCH-DECISION-032: Static rule metadata in one domain table keyed by rule id

- **Status:** Accepted
- **Story:** US-028
- **Amends:** [ARCH-DECISION-004](ARCH-DECISION-004-stateless-best-practice-rules.md). The rule model is unchanged; a second, data-only registry sits next to `RULES`.

## Context

US-028 shows, for each best practice, its reference in a referential ("RWEB 0075", "RGAA 1.1"), a French description quoted verbatim from the referential, an optional link to the official sheet and a source line. The data is static. It must also show on analyses saved before the story, so it cannot be persisted with the `BestPractice` results, and it must never be written to `localStorage`.

Options considered:

1. **Persist the metadata in every `BestPractice`.** Rejected: saved analyses would not get it, every page of every analysis would store about 1 kB of identical text, and fixing a typo would need a migration.
2. **Add `reference` / `description` / `link` fields to each `BestPracticeRule` object.** Rejected:
   - `src/background/index.ts` imports `RULES` to run the collectors, so about 8 kB of French text would be bundled into the background script, which never displays it;
   - US-029 edits every rule file in the same epic, so both stories would conflict on 17 files;
   - the UI would have to import the rule implementations to read static text.
3. **One data-only table, `RULE_METADATA`, keyed by rule id, in `domain/best-practices/rule-metadata.ts` (chosen).**

## Decision

- `src/app/domain/best-practices/rule-metadata.ts` exports:
  - `RuleReferential = "RWEB" | "RGAA"`;
  - `RuleMetadata = { reference?: { referential: RuleReferential; code: string }; description?: string; link?: string }`, where `code` is "0075" or "1.1" and the label is `` `${referential} ${code}` ``;
  - `RULE_METADATA: Readonly<Record<BestPracticeId, RuleMetadata>>`, one entry per id of `RULES`, data only;
  - `ruleMetadata(id)`, which returns the entry, or `{}` for an unknown id (a rule removed since the analysis was saved).
- It imports nothing but the `BestPracticeId` type. `index.ts` does not import it, so the background bundle stays unchanged.
- A missing value is an absent property, never `""`. The UI renders nothing for it (US-028 scenario 4).
- Descriptions are plain text. Line breaks are `\n`, and `**…**` is the only markup. They are rendered by a pure parser in the UI (`ui/analysis/rich-text.ts`) into text segments and `<strong>`, never as HTML.
- `rules-registry.test.ts` asserts that the keys of `RULE_METADATA` are exactly the ids of `RULES`, and checks each reference and link against the story table.
- The link opens through the existing `Browser.openUrlInNewTab` port. There is no new capability.

## Consequences

- Adding a best practice now means two edits: the rule in `RULES`, and its entry in `RULE_METADATA`. The registry test fails if the second is forgotten.
- Saved analyses display the current metadata, looked up by id when they are rendered.
- Licence: the RWEB texts are under CC BY-NC-ND 4.0 (GreenIT.fr, Collectif conception numérique responsable). They must stay verbatim, and the README and the "À propos" page credit them. The RGAA (DINUM) is under Licence Ouverte 2.0. Only format changes are allowed, such as `**bold**` or trimming a space inside the markers.
