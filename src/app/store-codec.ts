import { Analysis } from "./domain/models/analysis";
import { isBestPracticeIndicator } from "./domain/best-practices/indicator";
import { Service } from "./domain/models/service";

export interface StoredData {
  services: Service[];
  analysis: Analysis[];
}

/** Pure decoding of the localStorage payload: rehydrates dates/URLs and migrates legacy data. */
export function parseStoredData(json: string | null): StoredData {
  try {
    const decoded = JSON.parse(json ?? "");
    const analysis: Analysis[] =
      decoded.analysis?.map((el: any) => ({
        ...el,
        date: new Date(el.date),
        pages: el.pages.map((page: any) => {
          const decodedPage = {
            ...page,
            navigatedAt: new Date(page.navigatedAt),
            requests: page.requests.map((request: any) => ({
              ...request,
              url: new URL(request.url),
            })),
            domProfile: page.domProfile.map((domProfile: any) => ({
              ...domProfile,
              date: new Date(domProfile.date),
            })),
          };
          if (Array.isArray(page.bestPractices)) {
            // Legacy entries (before the rule engine) have no category.
            decodedPage.bestPractices = page.bestPractices.map((bp: any) => {
              // Saved analyses are final: a stored estimation progress is stale, drop it.
              const decodedBp = { ...bp, category: bp.category ?? "content" };
              delete decodedBp.progress;
              // US-029: keep a stored indicator only if it is well-formed.
              if ("indicator" in decodedBp && !isBestPracticeIndicator(decodedBp.indicator)) {
                delete decodedBp.indicator;
              }
              return decodedBp;
            });
          }
          return decodedPage;
        }),
      })) ?? [];
    return { services: decoded.services ?? [], analysis };
  } catch {
    return { services: [], analysis: [] };
  }
}

export function serializeStoredData(
  services: Service[],
  analysis: Analysis[]
): string {
  return JSON.stringify({ services, analysis });
}

/** True for the browser-specific "storage is full" errors (Chrome, Firefox, legacy code 22). */
export function isQuotaExceeded(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}
