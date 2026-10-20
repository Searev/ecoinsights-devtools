import { BestPracticeRule } from "../rule";
import { NetworkRequest } from "../../models/network-request";
import {
  isSuccess2xx,
  JAVASCRIPT_MIME_TYPES,
  lastRequestPerUrl,
  pathExtension,
} from "./request-helpers";
import { capLines, fileLine, plural, RuleLine } from "./rule-lines";

export type CacheVerdict = { compliant: true } | { compliant: false; reason: string };

const STATIC_EXTENSIONS = new Set(
  (
    "xml ogg ogv svg svgz eot otf woff woff2 mp4 ttf css rss atom js mjs jpg jpeg gif png ico zip tgz gz rar " +
    "bz2 doc xls exe ppt tar mid midi wav bmp rtf webp avif webm mp3 m4a"
  ).split(" ")
);

const STATIC_MIME_PREFIXES = ["image/", "font/", "audio/", "video/", "application/font-", "application/x-font-"];
const STATIC_MIME_TYPES: readonly string[] = [
  "text/css",
  ...JAVASCRIPT_MIME_TYPES,
  "application/zip",
  "application/gzip",
  "application/xml",
  "application/rss+xml",
  "application/atom+xml",
];

function isStaticFile(request: NetworkRequest): boolean {
  const extension = pathExtension(request.url);
  if (extension !== undefined) return STATIC_EXTENSIONS.has(extension);
  const type = request.type.toLowerCase();
  return STATIC_MIME_TYPES.includes(type) || STATIC_MIME_PREFIXES.some((p) => type.startsWith(p));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function utc(year: number, month: string, day: string, h: string, m: string, s: string): number {
  const monthIndex = MONTHS.indexOf(month.toLowerCase());
  if (monthIndex < 0) return NaN;
  return Date.UTC(year, monthIndex, Number(day), Number(h), Number(m), Number(s));
}

/** HTTP-date (IMF-fixdate, RFC 850 or asctime) to epoch ms; NaN when it is none of them. */
function parseHttpDate(value: string): number {
  const text = value.trim();
  let match = /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(text);
  if (match) return utc(Number(match[3]), match[2], match[1], match[4], match[5], match[6]);
  match = /^[A-Za-z]+day, (\d{2})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(text);
  if (match) {
    const yy = Number(match[3]);
    return utc(yy < 70 ? 2000 + yy : 1900 + yy, match[2], match[1], match[4], match[5], match[6]);
  }
  match = /^[A-Za-z]{3} ([A-Za-z]{3}) ([ \d]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(text);
  if (match) return utc(Number(match[6]), match[1], match[2].trim(), match[3], match[4], match[5]);
  return NaN;
}

/** First `max-age` directive holding a non-negative integer (quotes allowed); others are ignored. */
function maxAge(directives: readonly string[]): number | undefined {
  for (const directive of directives) {
    const match = /^max-age=(?:"(\d+)"|(\d+))$/.exec(directive);
    if (match) return Number(match[1] ?? match[2]);
  }
  return undefined;
}

/**
 * US-009: does the response allow the browser to reuse it? `Cache-Control` decides when it has a
 * decisive directive, otherwise `Expires` (against `Date`, else the request start time). Pure; never throws.
 */
export function cacheVerdict(
  headers: Readonly<Record<string, string>> | undefined,
  startedAt?: number
): CacheVerdict {
  const cacheControl = headers?.["cache-control"];
  const expires = headers?.["expires"];
  if (cacheControl !== undefined) {
    const directives = String(cacheControl)
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d !== "");
    if (directives.includes("no-store")) return { compliant: false, reason: "Cache-Control: no-store" };
    if (directives.includes("no-cache")) return { compliant: false, reason: "Cache-Control: no-cache" };
    const age = maxAge(directives);
    if (age === 0) return { compliant: false, reason: "max-age=0" };
    if ((age !== undefined && age > 0) || directives.includes("immutable")) return { compliant: true };
  }
  if (expires !== undefined) {
    const expiry = parseHttpDate(String(expires));
    if (Number.isNaN(expiry)) return { compliant: false, reason: "Expires invalide" };
    const dateHeader = headers?.["date"];
    let reference = dateHeader === undefined ? NaN : parseHttpDate(String(dateHeader));
    if (Number.isNaN(reference)) reference = startedAt ?? NaN;
    if (Number.isNaN(reference) || expiry > reference) return { compliant: true };
    return { compliant: false, reason: "Expires dans le passé" };
  }
  return {
    compliant: false,
    reason: cacheControl !== undefined ? "Cache-Control sans durée de cache" : "aucune entête de cache",
  };
}

/** US-009: static files served without a header allowing the browser to cache them. */
export const addCacheHeadersRule: BestPracticeRule = {
  id: "AddCacheHeaders",
  name: "Ajouter des entêtes Expires ou Cache-Control",
  category: "network",
  evaluate: ({ requests }) => {
    const statics = [
      ...lastRequestPerUrl(requests, (r) => (isSuccess2xx(r) || r.code === 304) && isStaticFile(r)).values(),
    ];
    const offenders: { url: string; size: number; reason: string }[] = [];
    for (const r of statics) {
      const verdict = cacheVerdict(r.responseHeaders, r.startedAt);
      if (!verdict.compliant) offenders.push({ url: r.url.href, size: r.responseSize, reason: verdict.reason });
    }
    if (offenders.length === 0) {
      return { compliance: "A", detail: "Tous les fichiers statiques peuvent être mis en cache" };
    }
    offenders.sort((a, b) => b.size - a.size || a.url.localeCompare(b.url));
    const n = offenders.length;
    const lines: RuleLine[] = offenders.map((o) => fileLine(o.url, ` : ${o.reason}`));
    return {
      compliance: n === statics.length ? "C" : "B",
      detail: `${n} ${plural(n, "fichier statique", "fichiers statiques")} sur ${statics.length} ${plural(n, "ne peut pas", "ne peuvent pas")} être mis en cache`,
      ...capLines(lines),
    };
  },
};
