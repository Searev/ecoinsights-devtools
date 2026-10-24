/** Product policy of the file previews (EPIC-PV). Data only. 1 MB = 1 000 000 bytes. */

/** US-015 PO default: larger files are refused ("Image trop volumineuse pour l'aperçu."), never decoded. */
export const MAX_PREVIEW_BYTES = 25_000_000;

/**
 * US-020 owner decision: only the first 500 000 characters (UTF-16 code units) of a text file are
 * displayed; "Poids" and "Lignes" still describe the whole file. Unrelated to `MAX_CONTENT_BYTES`.
 */
export const MAX_PREVIEW_TEXT_CHARS = 500_000;
