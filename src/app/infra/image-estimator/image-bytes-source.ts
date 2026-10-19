import { MAX_IMAGE_BYTES } from "../../domain/image-estimation/policy";
import { sniffImageFormat } from "../../domain/image-estimation/signature";
import { EstimationOutcome } from "../../domain/models/image-estimation";
import { ImageBytes } from "../image-codec/worker-protocol";

export type ImageBytesResult =
  | { ok: true; source: ImageBytes }
  | { ok: false; outcome: EstimationOutcome };

export type ImageBytesSource = (url: string) => Promise<ImageBytesResult>;

export interface ImageBytesSourceDeps {
  getDevtoolsContent?: (url: string) => Promise<{ content: string; encoding?: string } | null>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

/** Number of base64 characters decoded to check the signature (a multiple of 4). */
const SNIFF_CHARS = 64;

const unavailable = (message: string): ImageBytesResult => ({
  ok: false,
  outcome: { status: "failed", reason: "bytes-unavailable", message },
});

const TOO_LARGE: ImageBytesResult = {
  ok: false,
  outcome: { status: "skipped", reason: "too-large" },
};

/** Firefox does not report the encoding: accept the content when its first bytes are an image. */
function looksLikeBase64Image(content: string): boolean {
  try {
    const head = atob(content.slice(0, SNIFF_CHARS));
    const bytes = Uint8Array.from(head, (c) => c.charCodeAt(0));
    return sniffImageFormat(bytes) !== "unknown";
  } catch {
    return false;
  }
}

/**
 * Obtains the original bytes of an image (ARCH-DECISION-010): DevTools `getContent` first (what the
 * page loaded), else a cache-first re-fetch. Never throws.
 */
export function createImageBytesSource(deps: ImageBytesSourceDeps): ImageBytesSource {
  async function fromDevtools(url: string): Promise<ImageBytesResult | undefined> {
    if (!deps.getDevtoolsContent) return undefined;
    try {
      const found = await deps.getDevtoolsContent(url);
      if (!found || typeof found.content !== "string" || found.content === "") return undefined;
      if (found.encoding === "base64" || (found.encoding == null && looksLikeBase64Image(found.content))) {
        return { ok: true, source: { kind: "base64", data: found.content } };
      }
    } catch {
      // fall through to fetch
    }
    return undefined;
  }

  async function fromFetch(url: string): Promise<ImageBytesResult> {
    try {
      const response = await deps.fetch(url, { cache: "force-cache", credentials: "include" });
      if (!response.ok) return unavailable(`HTTP ${response.status}`);
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return TOO_LARGE;
      const data = await response.arrayBuffer();
      if (data.byteLength > MAX_IMAGE_BYTES) return TOO_LARGE;
      return { ok: true, source: { kind: "binary", data } };
    } catch (e) {
      return unavailable(e instanceof Error ? e.message : String(e));
    }
  }

  return async (url) => (await fromDevtools(url)) ?? fromFetch(url);
}
