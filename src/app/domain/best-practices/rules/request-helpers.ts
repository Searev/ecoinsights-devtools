/**
 * Request helpers shared by the request-based BP2 rules (US-008 to US-013).
 * Not part of any `collect`: this file is never serialised.
 */
import { NetworkRequest } from "../../models/network-request";
import { TextFileType } from "../../models/text-content";
import { GENERIC_MIME_TYPES } from "../../image-estimation/policy";
import { normaliseImageUrl } from "../../image-estimation/image-requests";

export function isSuccess2xx(request: NetworkRequest): boolean {
  return request.code >= 200 && request.code < 300;
}

/** Missing or generic MIME type: the URL extension decides instead (EPIC-BP2 US-008, US-013). */
export function isGenericMime(type: string): boolean {
  return GENERIC_MIME_TYPES.includes(type.toLowerCase());
}

/** Extension of the last path segment, lower case, without the dot; query and fragment ignored. */
export function pathExtension(url: URL): string | undefined {
  const segment = url.pathname.split("/").pop() ?? "";
  const dot = segment.lastIndexOf(".");
  if (dot < 0 || dot === segment.length - 1) return undefined;
  return segment.slice(dot + 1).toLowerCase();
}

export const JAVASCRIPT_MIME_TYPES: readonly string[] = [
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
];

const TEXT_MIME_TYPES: Readonly<Record<string, TextFileType>> = {
  "text/html": "HTML",
  "text/css": "CSS",
  "image/svg+xml": "SVG",
  ...Object.fromEntries(JAVASCRIPT_MIME_TYPES.map((t) => [t, "JS" as const])),
};

const TEXT_EXTENSIONS: Readonly<Record<string, TextFileType>> = {
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  js: "JS",
  mjs: "JS",
  svg: "SVG",
};

/** US-008 §2 / US-010 §2: text file type by MIME type, else (missing or generic MIME) by extension. */
export function textFileType(request: NetworkRequest): TextFileType | undefined {
  const type = request.type.toLowerCase();
  if (!isGenericMime(type)) return TEXT_MIME_TYPES[type];
  const extension = pathExtension(request.url);
  return extension === undefined ? undefined : TEXT_EXTENSIONS[extension];
}

/** US-011: host name, lower case, port ignored, trailing dot removed. IP addresses are kept. */
export function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/** `charset` parameter of the response `content-type` header, lower case, unquoted. */
export function contentTypeCharset(request: NetworkRequest): string | undefined {
  const header = request.responseHeaders?.["content-type"];
  if (header === undefined) return undefined;
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(header);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Last request matching `keep` per URL without fragment, in first-seen order. The same file
 * requested twice on a page counts once (EPIC-BP2).
 */
export function lastRequestPerUrl(
  requests: readonly NetworkRequest[],
  keep: (request: NetworkRequest) => boolean
): Map<string, NetworkRequest> {
  const byUrl = new Map<string, NetworkRequest>();
  for (const request of requests) {
    if (!keep(request)) continue;
    byUrl.set(normaliseImageUrl(request.url.href), request);
  }
  return byUrl;
}
