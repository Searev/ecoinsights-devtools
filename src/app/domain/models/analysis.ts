import { PageAnalysis } from "./page-analysis";
import { Service } from "./service";

export interface Analysis {
  id: string;
  date: Date;
  service: Service;
  pages: PageAnalysis[];
}
