/**
 * Session cache of previewed files (EPIC-PV §5, ARCH-DECISION-022, 024), on the session file cache
 * shared with the comparison dialog. Pure: the bytes come from an injected `PreviewFileLoader`.
 * Same semantics as the variant store (ARCH-DECISION-014): one in-flight load per key, held by the
 * store so it completes after the dialog closed; loaded files cached; errors never cached.
 */
import { SessionFileCache, createSessionFileCache } from "../image-comparison/session-file-cache";
import {
  PreviewFileLoader,
  PreviewFileResult,
  PreviewFileStore,
  PreviewFontInfo,
  PreviewImageInfo,
  PreviewTextInfo,
} from "../models/file-preview";

const imageKey = (url: string) => `preview-image:${url}`;
const fontKey = (url: string) => `preview-font:${url}`;
const textKey = (url: string) => `preview-text:${url}`;

export function createPreviewFileStore(
  loader: PreviewFileLoader,
  options: { cache?: SessionFileCache } = {}
): PreviewFileStore {
  const cache = options.cache ?? createSessionFileCache();
  const loading = new Map<string, Promise<PreviewFileResult<unknown>>>();

  /** Keys are prefixed: a key only ever holds the value type of its loader. */
  function peek<I>(key: string): PreviewFileResult<I> | undefined {
    return cache.get(key) as PreviewFileResult<I> | undefined;
  }

  function shared<I>(key: string, run: () => Promise<PreviewFileResult<I>>): Promise<PreviewFileResult<I>> {
    const cached = peek<I>(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const running = loading.get(key) as Promise<PreviewFileResult<I>> | undefined;
    if (running !== undefined) return running;
    let started: Promise<PreviewFileResult<I>>;
    try {
      started = run();
    } catch (reason) {
      started = Promise.reject(reason);
    }
    const promise = started
      .catch(
        (reason: unknown): PreviewFileResult<I> => ({
          status: "error",
          error: "unavailable",
          ...(reason instanceof Error ? { message: reason.message } : {}),
        })
      )
      .then((result) => {
        loading.delete(key);
        if (result.status === "loaded") cache.set(key, result);
        return result;
      });
    loading.set(key, promise);
    return promise;
  }

  return {
    image: (url, declaredType) =>
      shared<PreviewImageInfo>(imageKey(url), () => loader.loadImage(url, declaredType)),
    font: (url, declaredType) =>
      shared<PreviewFontInfo>(fontKey(url), () => loader.loadFont(url, declaredType)),
    text: (url, declaredType, charset) =>
      shared<PreviewTextInfo>(textKey(url), () => loader.loadText(url, declaredType, charset)),
    peekImage: (url) => peek<PreviewImageInfo>(imageKey(url)),
    peekFont: (url) => peek<PreviewFontInfo>(fontKey(url)),
    peekText: (url) => peek<PreviewTextInfo>(textKey(url)),
  };
}
