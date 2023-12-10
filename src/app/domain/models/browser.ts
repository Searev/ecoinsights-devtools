import { Closeable } from "./closeable";
import { DomInfos } from "./dom-infos";
import { NetworkRequest } from "./network-request";
import { PageDescription } from "./page-description";
import { PageInfos } from "./page-infos";

export interface NewDomAnalysis {
  domInfos: DomInfos;
  scannedPage: Omit<PageDescription, "description">;
}

export type NewAnalysisListener = (analysis: NewDomAnalysis) => void;

export type RequestDoneListener = (request: NetworkRequest) => void;

export type UrlChangeListener = (newUrl: string) => void;

export type BasicListener = () => void;

export interface Browser {
  checkPermission(): Promise<boolean>;
  getPageInfo(): Promise<PageInfos>;
  getPageDescription(): Promise<PageDescription>;
  getNetworkRequests(): Promise<NetworkRequest[]>;

  listenToDomProfile(onNewAnalysis: NewAnalysisListener): Closeable;
  listenToNetworkRequests(onRequestDone: RequestDoneListener): Closeable;
  listenToUrlChanges(onChange: UrlChangeListener): Closeable;
  listenToLinkClicked(onLinkClicked: BasicListener): Closeable;
  listenToFormSubmitted(onLinkClicked: BasicListener): Closeable;

  logInConsole(message: string): void;
  openUrlInNewTab(url: string): void;
  refreshCurrentPage(): Promise<void>;
}
