import { ContentJob, ContentOutcome } from "./text-content";

/**
 * Port: measures the captured content of a text file (US-010). See ARCH-DECISION-018.
 * Adapters live in `src/app/infra/content-analyser/` (DevTools content, or a fake for dev).
 *
 * Contract rules:
 * - `analyse` never rejects: every failure is a `not-evaluated` outcome.
 * - Contents come only from what DevTools captured; the adapter NEVER makes a network request.
 * - Contents are never kept after the analysis of a file, and never persisted.
 * - No main-thread task over 50 ms: the adapter works in chunks and yields between them.
 * - Scheduling (queue, cache, concurrency) belongs to the domain content queue.
 */
export interface ContentAnalyser {
  analyse(job: ContentJob): Promise<ContentOutcome>;
  /**
   * Optional: aborts the work in progress when the analysis stops. Pending `analyse` promises must
   * still settle (any outcome; the caller ignores it).
   */
  cancel?(): void;
}
