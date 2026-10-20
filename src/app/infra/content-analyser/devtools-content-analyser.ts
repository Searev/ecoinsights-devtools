import { ContentAnalyser } from "../../domain/models/content-analyser";
import { ContentJob, ContentOutcome } from "../../domain/models/text-content";
import { createMinificationScanner } from "../../domain/text-content/minification";
import { MAX_CONTENT_BYTES } from "../../domain/text-content/policy";

export interface DevtoolsContentAnalyserDeps {
  /** `ExtensionBrowser.getResourceContent`: what DevTools captured. The only source of content. */
  getDevtoolsContent(url: string): Promise<{ content: string; encoding?: string } | null>;
  /** Cooperative yield between slices. Defaults to a macrotask (`setTimeout(0)`). */
  yieldToEventLoop?: () => Promise<void>;
  /** Characters per slice; default 256 Ki. */
  sliceCharacters?: number;
}

const DEFAULT_SLICE_CHARACTERS = 262_144;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const notEvaluated = (
  reason: Extract<ContentOutcome, { status: "not-evaluated" }>["reason"],
  message?: string
): ContentOutcome => (message === undefined ? { status: "not-evaluated", reason } : { status: "not-evaluated", reason, message });

const STOPPED = notEvaluated("analysis-stopped");

function makeDecoder(charset: string | undefined): TextDecoder {
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: false });
  } catch {
    return new TextDecoder("utf-8", { fatal: false });
  }
}

function decodedBase64Length(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

/**
 * Content analyser on the bodies DevTools captured (ARCH-DECISION-018). There is no `fetch`
 * dependency by construction: nothing is ever re-downloaded. The content is decoded and scanned in
 * slices, yielding to the event loop between slices so that no task blocks the panel.
 */
export function createDevtoolsContentAnalyser(deps: DevtoolsContentAnalyserDeps): ContentAnalyser {
  const yieldToEventLoop = deps.yieldToEventLoop ?? defaultYield;
  const sliceCharacters = Math.max(4, deps.sliceCharacters ?? DEFAULT_SLICE_CHARACTERS);
  let generation = 0;

  async function run(job: ContentJob, startedIn: number): Promise<ContentOutcome> {
    const captured = await deps.getDevtoolsContent(job.url);
    if (startedIn !== generation) return STOPPED;
    if (captured == null || typeof captured.content !== "string" || captured.content === "") {
      return notEvaluated("content-unavailable");
    }
    const { content } = captured;
    const isBase64 =
      captured.encoding !== undefined
        ? captured.encoding === "base64"
        : content.length % 4 === 0 && content.length <= MAX_CONTENT_BYTES * 2 && BASE64_PATTERN.test(content);

    if (isBase64 ? decodedBase64Length(content) > MAX_CONTENT_BYTES : content.length > MAX_CONTENT_BYTES) {
      return notEvaluated("too-large");
    }

    const scanner = createMinificationScanner(job.type);
    const decoder = isBase64 ? makeDecoder(job.charset) : undefined;
    // A multiple of 4 so that each base64 slice decodes on its own.
    const step = isBase64 ? sliceCharacters - (sliceCharacters % 4) : sliceCharacters;
    for (let offset = 0; offset < content.length; offset += step) {
      if (offset > 0) {
        await yieldToEventLoop();
        if (startedIn !== generation) return STOPPED;
      }
      const slice = content.slice(offset, offset + step);
      if (decoder === undefined) {
        scanner.feed(slice);
      } else {
        const binary = atob(slice);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        scanner.feed(decoder.decode(bytes, { stream: true }));
      }
    }
    if (decoder !== undefined) scanner.feed(decoder.decode());
    const { characters, removableCharacters } = scanner.result();
    return { status: "analysed", characters, removableCharacters };
  }

  return {
    async analyse(job) {
      try {
        return await run(job, generation);
      } catch (error) {
        return notEvaluated("analysis-failed", error instanceof Error ? error.message : String(error));
      }
    },
    cancel() {
      generation++;
    },
  };
}
