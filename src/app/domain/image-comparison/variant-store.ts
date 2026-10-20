/**
 * Session cache of originals and variants for the comparison dialog (ARCH-DECISION-014).
 * Pure: the bytes come from an injected `ImageVariantGenerator`.
 */
import { COMPARISON_CACHE_MAX_BYTES } from "../image-estimation/policy";
import { EstimationJob, estimationKey } from "../models/image-estimation";
import {
  ImageFileResult,
  ImageVariantGenerator,
  ImageVariantStore,
} from "../models/image-variants";
import { createLruByteCache } from "./lru-byte-cache";

type LoadedFile = Extract<ImageFileResult, { status: "loaded" }>;

const originalKey = (url: string) => `original:${url}`;
const variantKey = (job: EstimationJob) => `variant:${estimationKey(job)}`;

/** A rejecting generator violates the port contract; it is reported like a normal failure. */
function messageOf(reason: unknown): string | undefined {
  return reason instanceof Error ? reason.message : undefined;
}

export function createImageVariantStore(
  generator: ImageVariantGenerator,
  options: { maxBytes?: number } = {}
): ImageVariantStore {
  const cache = createLruByteCache<LoadedFile>(
    options.maxBytes ?? COMPARISON_CACHE_MAX_BYTES,
    (file) => file.bytes.byteLength
  );
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
