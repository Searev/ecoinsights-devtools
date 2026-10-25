import type { BestPracticeId } from "../../domain/models/best-practice";
import { ruleMetadata, type RuleReferential } from "../../domain/best-practices/rule-metadata";
import { parseRichText, type RichTextLine } from "./rich-text";

export interface BestPracticeReferenceView {
  /** "RWEB 0075" or "RGAA 1.1". */
  label?: string;
  description?: RichTextLine[];
  link?: { url: string; label: string };
  source?: string;
}

const LINK_PREFIX: Record<RuleReferential, string> = {
  RWEB: "Consulter la fiche",
  RGAA: "Consulter le critère",
};

const SOURCE: Record<RuleReferential, string> = {
  RWEB: "Source : référentiel RWEB (GreenIT.fr)",
  RGAA: "Source : RGAA 4.1 (DINUM)",
};

/** What the panel of a best practice shows from its static metadata. Missing data is absent. */
export function referenceViewFor(ruleId: BestPracticeId): BestPracticeReferenceView {
  const { reference, description, link } = ruleMetadata(ruleId);
  const view: BestPracticeReferenceView = {};
  if (reference) {
    const label = `${reference.referential} ${reference.code}`;
    view.label = label;
    if (description !== undefined) view.description = parseRichText(description);
    if (link !== undefined) view.link = { url: link, label: `${LINK_PREFIX[reference.referential]} ${label}` };
    view.source = SOURCE[reference.referential];
    return view;
  }
  if (description !== undefined) view.description = parseRichText(description);
  return view;
}
