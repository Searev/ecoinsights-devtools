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
}
