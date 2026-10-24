/**
 * Product policy for the text-file rules (US-008, US-010). Data only.
 */

/** Files whose decoded size is under 1 000 bytes are ignored (US-008 §2, US-010 §2). */
export const MIN_TEXT_FILE_BYTES = 1_000;

/** US-010: files over 5 MB are not analysed and count as "non évalués". */
export const MAX_CONTENT_BYTES = 5_000_000;

/** US-010: a file is minified when its removable characters are under 5 % of its size (PO default). */
export const MINIFIED_MAX_REMOVABLE_SHARE = 0.05;

/** US-021: file names declaring a minified build; never measured, always minified. Lower case. */
export const DECLARED_MINIFIED_SUFFIXES: readonly string[] = [".min.js", ".min.mjs", ".min.css"];

/** US-021: a file is flagged only with at least this many removable characters (1 ko). */
export const MIN_REMOVABLE_CHARACTERS = 1_000;
