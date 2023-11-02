export interface NetworkRequest {
  method: string;
  url: URL;
  code: number;
  type: string;
  responseSize: number;
  transferSize: number;
}
