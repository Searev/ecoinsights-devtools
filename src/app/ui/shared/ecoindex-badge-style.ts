/**
 * US-030: the EcoIndex badge is filled with the grade colour, with black or white text, whichever
 * contrasts most. Same in both themes, since the grade colours do not change.
 */
import { contrastRatio } from "../theme/contrast";

export interface EcoIndexBadgeStyle {
  "background-color": string;
  "border-color": string;
  color: string;
}

export function ecoIndexBadgeStyle(gradeColour: string): EcoIndexBadgeStyle {
  const text = contrastRatio("#000000", gradeColour) >= contrastRatio("#ffffff", gradeColour) ? "#000000" : "#ffffff";
  return { "background-color": gradeColour, "border-color": gradeColour, color: text };
}
