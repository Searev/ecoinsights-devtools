/**
 * The session file cache shared by the comparison dialog (originals and variants) and the file
 * previews (EPIC-PV §5): one LRU bounded by bytes, 50 MB by default (ARCH-DECISION-014, 022).
 * Each store prefixes its keys ("original:", "variant:", "preview-image:", "preview-font:"), so a
 * key always maps to the value type of the store that wrote it.
 */
import { COMPARISON_CACHE_MAX_BYTES } from "../image-estimation/policy";
import { LruByteCache, createLruByteCache } from "./lru-byte-cache";

/** Anything cached for the session: sized by its bytes. */
export interface SessionFile {
  bytes: Uint8Array;
}

export type SessionFileCache = LruByteCache<SessionFile>;

export function createSessionFileCache(maxBytes: number = COMPARISON_CACHE_MAX_BYTES): SessionFileCache {
  return createLruByteCache<SessionFile>(maxBytes, (file) => file.bytes.byteLength);
}
