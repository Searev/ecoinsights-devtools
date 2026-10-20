/**
 * Text content analysis: shared contract (US-010). See docs/architecture/ARCH-DECISION-018.
 *
 * Plain, JSON-serialisable data. Contents themselves never appear here: only measurements.
 */
import { normaliseImageUrl } from "../image-estimation/image-requests";

/** Text file types checked by US-008 and US-010, as displayed in the lines ("JS, 250 ko"). */
export type TextFileType = "HTML" | "CSS" | "JS" | "SVG";

/** One text file whose captured content must be measured. */
export interface ContentJob {
  /** Absolute URL of the file, without fragment. */
  url: string;
  type: TextFileType;
  /** `charset` parameter of the response `content-type` header, lower case; undefined → UTF-8. */
  charset?: string;
}

export type ContentNotEvaluatedReason =
  /** DevTools has no content for this URL (loaded before the recording, evicted, unreadable). */
  | "content-unavailable"
  /** Over `MAX_CONTENT_BYTES`. */
  | "too-large"
  /** Still pending when the analysis was stopped. */
  | "analysis-stopped"
  /** Decoding or scanning threw. */
  | "analysis-failed"
  /** No analyser was injected (tests, legacy callers). */
  | "analyser-unavailable";

export type ContentOutcome =
  | {
      status: "analysed";
      /** UTF-16 code units of the decoded text. */
      characters: number;
      /** Characters the minification heuristic considers removable (comments, extra whitespace). */
      removableCharacters: number;
    }
  | { status: "not-evaluated"; reason: ContentNotEvaluatedReason; message?: string };

export type ContentState = { status: "pending" } | ContentOutcome;

/** Read-only view of the content-analysis cache. Undefined for a job never requested (treated as pending). */
export type ContentLookup = (job: ContentJob) => ContentState | undefined;

/** Cache key: one read and one analysis per URL per analysis (US-010 §5). */
export function contentKey(job: ContentJob): string {
  return normaliseImageUrl(job.url);
}

/** Lookup used when no analyser is available: every file is not evaluated. */
export const UNAVAILABLE_CONTENTS: ContentLookup = () => ({
  status: "not-evaluated",
  reason: "analyser-unavailable",
});

/** Share of removable characters, between 0 and 1; 0 for an empty file. */
export function removableShare(outcome: { characters: number; removableCharacters: number }): number {
  if (outcome.characters <= 0) return 0;
  return Math.min(1, Math.max(0, outcome.removableCharacters / outcome.characters));
}
