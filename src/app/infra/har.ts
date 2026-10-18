import { NetworkRequest } from "../domain/models/network-request";

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

  return {
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
}
