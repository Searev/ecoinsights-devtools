/**
 * Shared semantics of image requests for the image rules and the US-003 aggregation.
 * See docs/architecture/ARCH-DECISION-011.
 */
import { ImageFormat } from "../models/image-estimation";
import { NetworkRequest } from "../models/network-request";
import { GENERIC_MIME_TYPES, MIME_FORMATS } from "./policy";

/** Absolute URL without fragment; unparseable input is returned unchanged. */
export function normaliseImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

const isSuccess = (r: NetworkRequest) => (r.code >= 200 && r.code < 300) || r.code === 304;

/** Last successful (2xx or 304) request of the page for this image URL, fragment ignored. */
export function findImageRequest(
  requests: readonly NetworkRequest[],
  url: string
): NetworkRequest | undefined {
  const target = normaliseImageUrl(url);
  for (let i = requests.length - 1; i >= 0; i--) {
    const r = requests[i];
    if (isSuccess(r) && normaliseImageUrl(r.url.href) === target) return r;
  }
  return undefined;
}

/** True when the page actually downloaded the resource: 2xx with bytes on the wire (not cache, not 304). */
export function isTransferred(request: NetworkRequest | undefined): boolean {
  return (
    request !== undefined &&
    request.code >= 200 &&
    request.code < 300 &&
    request.transferSize > 0
  );
}

/**
 * Weight used as an image's original size:
 * 1. the transfer size when the page downloaded it (US-001 §2.4);
 * 2. else the body size (served from cache or revalidated), so the same image keeps the same gain
 *    on every page (US-001 scenario 11);
 * 3. else the byte length of the file obtained by the estimator;
 * 4. else unknown.
 */
export function originalBytesOf(
  request: NetworkRequest | undefined,
  sourceBytes?: number
): number | undefined {
  if (isTransferred(request)) return request!.transferSize;
  if (request !== undefined && request.responseSize > 0) return request.responseSize;
  if (sourceBytes !== undefined && sourceBytes > 0) return sourceBytes;
  return undefined;
}

/**
 * Format from the response MIME type (US-002 rule 1: never from the extension).
 * - a known image type → its format;
 * - a missing or generic type → "generic" (the file signature decides, in the codec);
 * - an unknown `image/*` type → "unknown";
 * - any other type → undefined (not an image).
 */
export function formatFromMime(mime: string): ImageFormat | "generic" | undefined {
  const type = mime.split(";")[0].trim().toLowerCase();
  if (GENERIC_MIME_TYPES.includes(type)) return "generic";
  const format = MIME_FORMATS[type];
  if (format !== undefined) return format;
  return type.startsWith("image/") ? "unknown" : undefined;
}
