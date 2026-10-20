import { MAX_PREVIEW_BYTES } from "../../domain/file-preview/policy";
import { sniffImageFormat } from "../../domain/image-estimation/signature";
import {
  PreviewFileLoader,
  PreviewFileResult,
  PreviewFontInfo,
  PreviewImageInfo,
} from "../../domain/models/file-preview";
import { decodeBase64 } from "../image-codec/base64";
import { detectFontFormat } from "./font-format";
import { describePreviewImage } from "./preview-image-info";

export interface PreviewFileLoaderDeps {
  getDevtoolsContent?: (url: string) => Promise<{ content: string; encoding?: string } | null>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Defaults to `MAX_PREVIEW_BYTES`. */
  maxBytes?: number;
}

type FileKind = "image" | "font";
type Obtained =
  | { ok: true; bytes: Uint8Array; mimeType: string | undefined }
  | { ok: false; error: "unavailable" | "too-large"; message?: string };

const BASE64_SHAPE = /^[A-Za-z0-9+/]+={0,2}$/;
/** Base64 characters decoded to check the signature (a multiple of 4). */
const SNIFF_CHARS = 48;

const failure = (error: "unavailable" | "too-large", message?: string): Obtained =>
  message === undefined ? { ok: false, error } : { ok: false, error, message };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function decodedBase64Length(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return Math.floor((content.length * 3) / 4) - padding;
}

function hasKnownSignature(kind: FileKind, head: Uint8Array): boolean {
  return kind === "image" ? sniffImageFormat(head) !== "unknown" : detectFontFormat(head, "", "") !== "unknown";
}

/** Firefox does not report the encoding: accept the content when it is base64 of a known file kind. */
function looksLikeBase64(kind: FileKind, content: string): boolean {
  if (content.length % 4 !== 0 || !BASE64_SHAPE.test(content)) return false;
  try {
    return hasKnownSignature(kind, decodeBase64(content.slice(0, SNIFF_CHARS)));
  } catch {
    return false;
  }
}

/**
 * Obtains the bytes of a previewed file (ARCH-DECISION-022): DevTools content first (what the page
 * loaded), else a cache-first re-download from the panel, capped at `maxBytes`. Never rejects.
 */
export function createPreviewFileLoader(deps: PreviewFileLoaderDeps): PreviewFileLoader {
  const maxBytes = deps.maxBytes ?? MAX_PREVIEW_BYTES;

  async function fromDevtools(url: string, kind: FileKind): Promise<Obtained | undefined> {
    if (!deps.getDevtoolsContent) return undefined;
    try {
      const found = await deps.getDevtoolsContent(url);
      if (!found || typeof found.content !== "string" || found.content === "") return undefined;
      const { content, encoding } = found;
      if (encoding === "base64" || (encoding == null && looksLikeBase64(kind, content))) {
        if (decodedBase64Length(content) > maxBytes) return failure("too-large");
        return { ok: true, bytes: decodeBase64(content), mimeType: undefined };
      }
      if (kind === "image" && sniffImageFormat(new TextEncoder().encode(content.slice(0, 64))) === "svg") {
        // Chrome reports SVG content as text.
        const bytes = new TextEncoder().encode(content);
        return bytes.length > maxBytes ? failure("too-large") : { ok: true, bytes, mimeType: undefined };
      }
    } catch {
      // fall through to fetch
    }
    return undefined;
  }

  async function readBody(response: Response): Promise<Obtained> {
    if (!response.body) {
      const data = new Uint8Array(await response.arrayBuffer());
      return data.length > maxBytes ? failure("too-large") : { ok: true, bytes: data, mimeType: undefined };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return failure("too-large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { ok: true, bytes, mimeType: undefined };
  }

  async function fromFetch(url: string): Promise<Obtained> {
    try {
      const response = await deps.fetch(url, { cache: "force-cache", credentials: "include" });
      if (!response.ok) return failure("unavailable", `HTTP ${response.status}`);
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        Promise.resolve(response.body?.cancel()).catch(() => undefined);
        return failure("too-large");
      }
      const body = await readBody(response);
      if (!body.ok) return body;
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      return { ...body, mimeType: contentType || undefined };
    } catch (e) {
      return failure("unavailable", messageOf(e));
    }
  }

  async function obtain(url: string, kind: FileKind): Promise<Obtained> {
    return (await fromDevtools(url, kind)) ?? fromFetch(url);
  }

  async function load<I>(
    url: string,
    declaredType: string,
    kind: FileKind,
    describe: (bytes: Uint8Array, mime: string) => I | undefined
  ): Promise<PreviewFileResult<I>> {
    try {
      const obtained = await obtain(url, kind);
      if (!obtained.ok) {
        return obtained.message === undefined
          ? { status: "error", error: obtained.error }
          : { status: "error", error: obtained.error, message: obtained.message };
      }
      const mime = obtained.mimeType ?? declaredType.split(";")[0].trim().toLowerCase();
      const info = describe(obtained.bytes, mime);
      if (info === undefined) return { status: "error", error: "unavailable", message: `not ${kind === "image" ? "an image" : "a font"}` };
      return { status: "loaded", bytes: obtained.bytes, info };
    } catch (e) {
      return { status: "error", error: "unavailable", message: messageOf(e) };
    }
  }

  return {
    loadImage: (url, declaredType): Promise<PreviewFileResult<PreviewImageInfo>> =>
      load(url, declaredType, "image", describePreviewImage),
    loadFont: (url, declaredType): Promise<PreviewFileResult<PreviewFontInfo>> =>
      load(url, declaredType, "font", (bytes, mime) => ({
        format: detectFontFormat(bytes.subarray(0, 64), mime, url),
        byteLength: bytes.length,
        mimeType: mime,
      })),
  };
}
