/**
 * EPIC-PV §4: the information list of a preview. Pure row builders of each body
 * (`image-preview-format.ts`, `media-format.ts`, `iframe-format.ts`, `font-preview-format.ts`)
 * return these rows; `PreviewInfoList.tsx` renders them as a `<dl>`. Values are never empty: an
 * unknown value is "inconnu" / "inconnue" or the story's wording.
 */
export interface InfoRow {
  /** French label, e.g. "Résolution". */
  label: string;
  /** French value, e.g. "1 200 ko" (`formatKo`) or "1200 × 800 px". */
  value: string;
}

/** Loading text of the image and media previews (epic §7). The font uses its own wording. */
export const PREVIEW_LOADING = "Chargement…";
