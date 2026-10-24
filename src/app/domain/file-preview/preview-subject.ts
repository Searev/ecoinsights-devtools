/**
 * Preview subjects of best-practice lines (EPIC-PV, ARCH-DECISION-020). Pure.
 *
 * A line is previewable when its `LineRef` names an `http(s)` file and the rule said what it is
 * (`LineRef.preview`), or, for refs saved before the epic, when the rule and the prefix say it
 * unambiguously (`legacyLinePreview`). Everything else the dialogs need comes from the page's
 * recorded requests, matched by URL without fragment.
 */
import { contentTypeCharset } from "../best-practices/rules/request-helpers";
import { normaliseImageUrl } from "../image-estimation/image-requests";
import { LinePreview, LineRef, TextPreviewType } from "../models/best-practice";
import { PreviewSubject } from "../models/file-preview";
import { NetworkRequest } from "../models/network-request";

const HTTP_URL = /^https?:\/\//i;

/** Epic §1: only `http(s)` files can be read again; `blob:` and `data:` belong to the page. */
export function isPreviewableUrl(url: string): boolean {
  if (!HTTP_URL.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * US-020 S12: end of a US-010 offender line, "<name> (<type>, <weight>) : non minifié (~N % d'octets
 * superflus)". Anchored at the end, so a file name that looks like a line cannot fool it.
 */
const MINIFY_OFFENDER_END = / \((CSS|JS|HTML|SVG), [^()]*\) : non minifié \(~\d+ % d'octets superflus\)$/;

/**
 * Epic §6: the kind of a ref saved before EPIC-PV (or before US-020), from its rule, prefix and,
 * when the prefix is not enough, the line text. Unprefixed US-006 lines stay plain: an `<img>`
 * line cannot be told from an `<area>` link line. `MinifyTextFiles` offender lines are previewable,
 * "non évalué" lines are not (ARCH-DECISION-024).
 */
export function legacyLinePreview(
  ruleId: string,
  prefix: string | undefined,
  text?: string
): LinePreview | undefined {
  const p = prefix ?? "";
  switch (ruleId) {
    case "LimitGifs":
      return p === "" ? { kind: "image" } : undefined;
    case "UseLazyLoading":
      return p === "" ? { kind: "image" } : p === "Iframe " ? { kind: "iframe" } : undefined;
    case "ProvideTextAlternatives":
      return p === "Vidéo " ? { kind: "video" } : undefined;
    case "AvoidMediaAutoplay":
      return p === "Vidéo " ? { kind: "video" } : p === "Son " ? { kind: "audio" } : undefined;
    case "UseStandardFonts":
      return p === "" ? { kind: "font" } : undefined;
    case "MinifyTextFiles": {
      if (p !== "" || text === undefined) return undefined;
      const match = MINIFY_OFFENDER_END.exec(text);
      return match ? { kind: "text", type: match[1] as TextPreviewType } : undefined;
    }
    default:
      return undefined;
  }
}

/** `href` without fragment, without parsing when there is none (this runs for every request). */
function requestKey(request: NetworkRequest): string {
  const href = request.url.href;
  return href.includes("#") ? normaliseImageUrl(href) : href;
}

/** Last non-empty response MIME type; undefined when none. */
function lastType(requests: readonly NetworkRequest[]): string | undefined {
  for (let i = requests.length - 1; i >= 0; i--) {
    if (requests[i].type !== "") return requests[i].type;
  }
  return undefined;
}

/** Same convention as US-013 and US-018: the transfer size, or the body size when served from the cache. */
function downloadedBytes(requests: readonly NetworkRequest[]): number | undefined {
  if (requests.length === 0) return undefined;
  return requests.reduce((sum, r) => sum + (r.transferSize > 0 ? r.transferSize : r.responseSize), 0);
}

/**
 * Returns a resolver from a line's `LineRef` (and, for legacy refs, its text) to its preview
 * subject, or undefined when the line is not previewable. The requests are indexed by URL once, on
 * the first call: build one resolver per page and per rendering, never keep it across updates of a
 * recording.
 */
export function createPreviewSubjectResolver(
  requests: readonly NetworkRequest[]
): (ruleId: string, ref: LineRef, text?: string) => PreviewSubject | undefined {
  let index: Map<string, NetworkRequest[]> | undefined;

  function requestsOf(url: string): readonly NetworkRequest[] {
    if (index === undefined) {
      index = new Map();
      for (const request of requests) {
        const key = requestKey(request);
        const list = index.get(key);
        if (list === undefined) index.set(key, [request]);
        else list.push(request);
      }
    }
    return index.get(normaliseImageUrl(url)) ?? [];
  }

  return (ruleId, ref, text) => {
    if (!isPreviewableUrl(ref.url)) return undefined;
    const preview = ref.preview ?? legacyLinePreview(ruleId, ref.prefix, text);
    if (preview === undefined) return undefined;
    const { url } = ref;
    const recorded = requestsOf(url);
    const type = lastType(recorded);

    switch (preview.kind) {
      case "image":
        return {
          kind: "image",
          url,
          ruleId,
          declaredType: type ?? "",
          ...(preview.display !== undefined ? { display: preview.display } : {}),
        };
      case "video":
      case "audio": {
        const bytes = downloadedBytes(recorded);
        const last = recorded[recorded.length - 1];
        return {
          kind: "media",
          media: preview.kind,
          url,
          ruleId,
          ...(type !== undefined ? { mimeType: type } : {}),
          ...(bytes !== undefined ? { downloadedBytes: bytes } : {}),
          ...(last !== undefined ? { recordedStatus: last.code } : {}),
          ...(preview.kind === "video" && preview.display !== undefined ? { display: preview.display } : {}),
        };
      }
      case "iframe": {
        const document = recorded[recorded.length - 1];
        return {
          kind: "iframe",
          url,
          ruleId,
          host: new URL(url).hostname,
          ...(type !== undefined ? { mimeType: type } : {}),
          ...(document !== undefined ? { transferredBytes: document.transferSize } : {}),
          ...(preview.top !== undefined ? { top: preview.top } : {}),
        };
      }
      case "font":
        return { kind: "font", url, ruleId, declaredType: type ?? "" };
      case "text": {
        const last = recorded[recorded.length - 1];
        const charset = last === undefined ? undefined : contentTypeCharset(last);
        return {
          kind: "text",
          url,
          ruleId,
          fileType: preview.type,
          declaredType: type ?? "",
          ...(charset !== undefined ? { charset } : {}),
        };
      }
    }
  };
}
