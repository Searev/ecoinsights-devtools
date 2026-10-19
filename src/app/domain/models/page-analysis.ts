import { BestPractice } from "./best-practice";
import { DomProfile } from "./dom-infos";
import { PageImageGain } from "./image-estimation";
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
  bestPractices?: BestPractice[];
  /**
   * US-003: combined estimated image gain of the page. Undefined for analyses saved before
   * US-003 and when best practices are not checked (shown as "—", not counted in totals).
   */
  imageGain?: PageImageGain;
}
