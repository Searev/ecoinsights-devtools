/** Rows of the iframe data modal (US-017). Data only: nothing is loaded. */
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { formatCount } from "../../../domain/best-practices/rules/rule-lines";
import { IframePreviewSubject } from "../../../domain/models/file-preview";
import { InfoRow } from "./info-rows";

export function iframeInfoRows(subject: IframePreviewSubject): InfoRow[] {
  return [
    { label: "Hôte", value: subject.host },
    { label: "Type", value: subject.mimeType ? subject.mimeType : "inconnu" },
    {
      label: "Poids transféré",
      value: subject.transferredBytes === undefined ? "non mesuré" : formatKo(subject.transferredBytes),
    },
    {
      label: "Position",
      value: subject.top === undefined ? "inconnue" : `à ${formatCount(subject.top)} px du haut de page`,
    },
  ];
}
