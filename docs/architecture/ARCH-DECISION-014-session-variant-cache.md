# ARCH-DECISION-014: A domain variant store caches originals and variants for the panel session, LRU capped at 50 MB

- **Status:** Accepted (US-005)

## Context

US-005 asks that reopening an image is instant (scenario 8), that a generation still running when the dialog closes completes and fills the cache (scenario 14), that only the selected variant is generated, and that the cache is capped (PO default 50 MB, LRU). Generating a variant needs the original bytes, which may come from a re-download.

## Decision

- **`ImageVariantStore`** (`domain/models/image-variants.ts`), implemented by `createImageVariantStore(generator, { maxBytes })` in `src/app/domain/image-comparison/variant-store.ts`. Pure TypeScript with an injected `ImageVariantGenerator`: tested with a fake generator.
  - `original(url, declaredType)`: cached by URL.
  - `variant(job)`: cached by `estimationKey(job)`; gets the original through `original()` (cache or load), then `generator.generate(job, bytes)`. An original failure yields `original-unavailable` without calling `generate` (scenario 9).
  - **In-flight sharing:** concurrent calls for the same key share one promise. The promise is held by the store, not by the dialog, so it completes and fills the cache after the dialog closed (scenario 14); a later call joins it while it runs.
  - **Errors are never cached:** "Réessayer" calls the store again and retries for real (scenario 10).
  - `peekOriginal` / `peekVariant`: synchronous reads, so a cached version is displayed without a loading frame (scenario 8).
- **LRU by bytes** (`src/app/domain/image-comparison/lru-byte-cache.ts`): generic, pure. An entry's size is its byte length; reads refresh the position; inserting evicts the least recently used entries until the total is ≤ `maxBytes`; an entry larger than `maxBytes` is returned to the caller but not cached. Default `COMPARISON_CACHE_MAX_BYTES = 50_000_000` (`policy.ts`, 1 MB = 1 000 000 bytes).
- **Lifetime:** one store per panel session, created in `src/app/index.tsx` from the app's estimator and provided to the dialog host (ARCH-DECISION-016). Nothing is persisted (story: no persistence).

## Consequences

- An evicted original is re-obtained (DevTools content or HTTP cache) the next time a variant needs it.
- Object URLs are not cached: the UI creates them per opening and revokes them on close (ARCH-DECISION-016). The bytes stay in the store.
