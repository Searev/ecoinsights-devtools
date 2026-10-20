import { HttpVersion, NetworkRequest } from "../domain/models/network-request";

/**
 * US-012: normalises the HAR `response.httpVersion` of Chrome ("http/2.0", "h3") or Firefox
 * ("HTTP/2", "HTTP/1.1"). Undefined when empty or unrecognised.
 */
export function normaliseHttpVersion(raw: unknown): HttpVersion | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "http/1.0") return "1.0";
  if (value === "http/1.1") return "1.1";
  if (value === "http/2" || value === "http/2.0" || value === "h2" || value === "h2c") return "2";
  if (value === "http/3" || value === "h3" || value.startsWith("h3-")) return "3";
  return undefined;
}

/** Normalises a DevTools HAR entry (Chrome or Firefox). Returns null for non-http(s) resources. */
export function toNetworkRequest(entry: HARFormatEntry): NetworkRequest | null {
  let url: URL;
  try {
    url = new URL(entry.request?.url ?? "");
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  const response = entry.response as any;
  const content = response?.content ?? {};
  const transfer = response?._transferSize;
  const transferSize =
    typeof transfer === "number" && transfer >= 0
      ? transfer
      : Math.max(0, response?.bodySize ?? 0) +
        Math.max(0, response?.headersSize ?? 0);

  const responseHeaders: Record<string, string> = {};
  for (const header of (response?.headers ?? []) as Array<{
    name: string;
    value: string;
  }>) {
    const name = header.name.toLowerCase();
    responseHeaders[name] =
      name in responseHeaders
        ? `${responseHeaders[name]}, ${header.value}`
        : header.value;
  }

  const httpVersion = normaliseHttpVersion(response?.httpVersion);
  const started = Date.parse((entry as any).startedDateTime);

  const request: NetworkRequest = {
    method: entry.request.method ?? "",
    url,
    code: response?.status ?? 0,
    type: ((content.mimeType as string | undefined) ?? "")
      .split(";")[0]
      .trim(),
    responseSize: content.size ?? 0,
    transferSize,
    responseHeaders,
  };
  // Optional keys are omitted when unknown, so persisted JSON stays minimal (ARCH-DECISION-019).
  if (httpVersion !== undefined) request.httpVersion = httpVersion;
  if (Number.isFinite(started)) request.startedAt = started;
  return request;
}
