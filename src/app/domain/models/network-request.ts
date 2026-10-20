/** HTTP version of a response, normalised from the HAR `response.httpVersion` (US-012). */
export type HttpVersion = "1.0" | "1.1" | "2" | "3";

export interface NetworkRequest {
  method: string;
  url: URL;
  code: number;
  /** Response MIME type, without parameters (e.g. `text/css`). Empty string if unknown. */
  type: string;
  /** Decoded body size in bytes (HAR `content.size`). */
  responseSize: number;
  /** Bytes on the wire (HAR `_transferSize`, else `bodySize + headersSize`, never negative). */
  transferSize: number;
  /**
   * Response headers with lower-cased names. Optional: analyses persisted before the
   * rule engine do not have it, and it is not required by the EcoIndex computation.
   */
  responseHeaders?: Record<string, string>;
  /**
   * US-012: protocol of the response. Undefined when unknown (empty or unrecognised HAR value),
   * and in analyses saved before US-012. See ARCH-DECISION-019.
   */
  httpVersion?: HttpVersion;
  /**
   * US-009: time the request started, in epoch milliseconds (HAR `startedDateTime`). Undefined
   * when unknown or unparseable, and in analyses saved before US-009. See ARCH-DECISION-019.
   */
  startedAt?: number;
}
