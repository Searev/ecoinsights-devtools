# ARCH-DECISION-018: Text content analysis behind a second domain queue; DevTools content only, chunked on the panel thread

- **Status:** Accepted (US-010)
- **Amends:** [ARCH-DECISION-004](ARCH-DECISION-004-stateless-best-practice-rules.md) and [007](ARCH-DECISION-007-async-image-estimation.md) (adds an optional `contentAnalyses` phase and `RuleContext.contents`; generalises the estimation queue)

## Context

US-010 grades minification from the content of each CSS, JS, HTML and SVG file. Reading a captured content is asynchronous (`getContent`), and a 5 MB file must not block the panel: no task over 50 ms, under 500 ms in total. `evaluate` must stay pure and synchronous (004). While contents are being read, the rule shows "Analyse en cours… (n/N fichiers)" and updates by itself. Stopping the analysis settles what is still pending as "analyse arrêtée". Contents must never be re-downloaded or persisted.

ARCH-DECISION-007 solved the same shape of problem for images: declarative jobs, a domain queue cached per key, a port that never rejects, and a lookup read by `evaluate`. But its types are image-specific (`EstimationJob.transform`, `ImageEstimator`, the `skipped`/`failed` reasons, the codec worker).

Options considered:

1. **Add a "text" transform to `EstimationJob` and route it through `ImageEstimator`.** Rejected: it mixes two ports with different sources (no re-fetch here) and pollutes the image types, the worker protocol and the US-003 aggregation.
2. **Read contents inside `evaluate` or in the use case without a queue.** Rejected: it breaks 004 and duplicates the caching, stop and re-evaluation logic of 007.
3. **A second, content-specific job type and port, on a generic domain queue (chosen).**

For running the heuristic, a Web Worker was considered. It was rejected: the contents already live in the panel (DevTools gives them as strings), and posting 5 MB to a worker costs a copy. A second worker bundle adds build surface. A streaming scanner, fed in slices on the panel thread with a yield between slices, meets the 50 ms budget and is easy to test.

## Decision

- **Contract** (`domain/models/text-content.ts`, `domain/models/content-analyser.ts`, `domain/text-content/policy.ts`):
  - `ContentJob = { url, type: TextFileType, charset? }`, keyed by `contentKey(job)` (the URL without fragment): one read per URL per analysis.
  - `ContentOutcome = analysed { characters, removableCharacters } | not-evaluated { reason }`. Reasons: `content-unavailable`, `too-large`, `analysis-stopped`, `analysis-failed`, `analyser-unavailable`.
  - `ContentLookup` and the default `UNAVAILABLE_CONTENTS`.
  - The port `ContentAnalyser { analyse(job): Promise<ContentOutcome>; cancel?() }` never rejects.
  - Policy: `MIN_TEXT_FILE_BYTES` 1 000, `MAX_CONTENT_BYTES` 5 000 000, `MINIFIED_MAX_REMOVABLE_SHARE` 0.05.
- **Rule model:** a rule may declare `contentAnalyses?(ctx): ContentJob[]`, pure and synchronous, and reads results through `ctx.contents`. The engine gains `planContentAnalyses(rules, input)`. `evaluateRules` passes `input.contents ?? UNAVAILABLE_CONTENTS`.
  - `RuleContext.contents` is optional in the type only, so that hand-built contexts of other rules stay valid. The engine always sets it.
- **Queue:** `estimation-queue.ts` is generalised into a generic `createWorkQueue` (domain): cache per key, FIFO, concurrency 1, `onChange` per settled job, `stop()` settling pending jobs with a given outcome and ignoring late results.
  - `createEstimationQueue(estimator)` keeps its signature and behaviour on top of it.
  - `createContentQueue(analyser)` is the second instance.
  - `analyse-web-flow` creates both when best practices are checked. Both bump the same version counter, so closed pages are rebuilt on either change. `stopAnalysis()` stops both before building the final pages.
- **Heuristic:** `domain/text-content/minification.ts` is pure and streaming. `createMinificationScanner(type)` exposes `feed(chunk)` and `result()`, and gives the same result for any chunking. `minified ⇔ removableShare < 5 %`; the rule applies that threshold, not the adapter.
- **Adapter** (`infra/content-analyser/devtools-content-analyser.ts`):
  - It takes the content from `ExtensionBrowser.getResourceContent(url)` only. **It has no `fetch` dependency at all.**
  - It decodes base64 (Chrome reports `encoding: "base64"`; Firefox reports no encoding, so a content made only of base64 characters is decoded) in slices, with `TextDecoder(charset ?? "utf-8", { fatal: false })` in streaming mode.
  - It feeds the scanner in slices and yields to the event loop between them. The yield is injected, so tests control it.
  - It drops every reference to the content when done. `cancel()` makes the file in progress settle `analysis-stopped`.
  - `FakeContentAnalyser` serves `npm run dev`. `getContentAnalyser()` (factory, called only from `index.tsx`) picks the adapter. The UI reads it with `useContentAnalyser()` and passes `options.contentAnalyser` to `analyseWebFlow`.
- **Progress:** `EstimationProgress.unit?: "images" | "files"`. The UI shows "Analyse en cours… (n/N fichiers)" for `files`.

## Consequences

- Rules without content analyses are unchanged.
- `ExtensionBrowser` keeps references to the last 1 000 HAR entries (already the case for images). Contents are read lazily and released after each file, so the memory bound is unchanged.
- A file the page loaded before the recording started, or that DevTools evicted, is "non évalué". This is the product decision: nothing is re-downloaded.
- The heuristic runs on the panel thread. If profiling shows a slice over 50 ms on slow machines, the slice size is a constant of the adapter, and moving the scanner to a worker stays possible behind the same port.
