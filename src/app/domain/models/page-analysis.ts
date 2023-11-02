import { DomProfile } from "./dom-infos";
import { Impact } from "./impact";
import { NetworkRequest } from "./network-request";

export interface PageAnalysis {
  title: string;
  url: string;
  navigatedAt: Date;
  requests: NetworkRequest[];
  domProfile: DomProfile;
  maxDomSize: number;
  requestSizeInKb: number;
  impact: Impact;
}
