import { Closeable } from "./closeable";
import { DomInfos } from "./dom-infos";
import { NetworkRequest } from "./network-request";
import { PageDescription } from "./page-description";
import { PageInfos } from "./page-infos";

export interface Browser {
  getPageInfo(): Promise<PageInfos>;
  getPageDescription(): Promise<PageDescription>;
  getNetworkRequests(): Promise<NetworkRequest[]>;

  listenToDomProfile(
    onNewAnalysis: (
      domInfos: DomInfos,
      scannedPage: Omit<PageDescription, "description">
    ) => void
  ): Closeable;
  listenToNetworkRequests(
    onRequestDone: (request: NetworkRequest) => void
  ): Closeable;
  listenToUrlChanges(onChange: (newUrl: string) => void): Closeable;

  logInConsole(message: string): void;
  openUrlInNewTab(url: string): void;
  refreshCurrentPage(): Promise<void>;
}
