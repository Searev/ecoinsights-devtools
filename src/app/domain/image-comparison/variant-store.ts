/**
 * Session cache of originals and variants for the comparison dialog (ARCH-DECISION-014).
 * Pure: the bytes come from an injected `ImageVariantGenerator`.
 */
import { EstimationJob, estimationKey } from "../models/image-estimation";
import {
  ImageFileResult,
  ImageVariantGenerator,
  ImageVariantStore,
} from "../models/image-variants";
import { SessionFileCache, createSessionFileCache } from "./session-file-cache";

type LoadedFile = Extract<ImageFileResult, { status: "loaded" }>;

const originalKey = (url: string) => `original:${url}`;
const variantKey = (job: EstimationJob) => `variant:${estimationKey(job)}`;

/** A rejecting generator violates the port contract; it is reported like a normal failure. */
function messageOf(reason: unknown): string | undefined {
  return reason instanceof Error ? reason.message : undefined;
}

/**
 * `cache`: the session file cache shared with the previews (EPIC-PV §5); without it, the store owns
 * a cache of `maxBytes` (default `COMPARISON_CACHE_MAX_BYTES`).
 */
export function createImageVariantStore(
  generator: ImageVariantGenerator,
  options: { maxBytes?: number; cache?: SessionFileCache } = {}
): ImageVariantStore {
  const files = options.cache ?? createSessionFileCache(options.maxBytes);
  // Keys are prefixed "original:" / "variant:": this store only reads values it wrote.
  const cache = {
    get: (key: string) => files.get(key) as LoadedFile | undefined,
    set: (key: string, value: LoadedFile) => files.set(key, value),
  };
  // In-flight work is held here, not by the callers, so it completes after every caller went away.
  const loading = new Map<string, Promise<ImageFileResult>>();

  /** Shares one run per key, caches loaded results, never caches errors. */
  function shared(key: string, run: () => Promise<ImageFileResult>): Promise<ImageFileResult> {
    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const running = loading.get(key);
    if (running !== undefined) return running;
    const promise = run().then((result) => {
      loading.delete(key);
      if (result.status === "loaded") cache.set(key, result);
      return result;
    });
    loading.set(key, promise);
    return promise;
  }

  function original(url: string, declaredType: string): Promise<ImageFileResult> {
    return shared(originalKey(url), async () => {
      try {
        return await generator.loadOriginal(url, declaredType);
      } catch (reason) {
        return { status: "error", error: "original-unavailable", message: messageOf(reason) };
      }
    });
  }

  return {
    original,
    variant(job) {
      return shared(variantKey(job), async () => {
        const source = await original(job.url, job.declaredType);
        if (source.status !== "loaded") {
          return { status: "error", error: "original-unavailable", message: source.message };
        }
        try {
          return await generator.generate(job, source.bytes);
        } catch (reason) {
          return { status: "error", error: "generation-failed", message: messageOf(reason) };
        }
      });
    },
    peekOriginal: (url) => cache.get(originalKey(url)),
    peekVariant: (job) => cache.get(variantKey(job)),
  };
}
