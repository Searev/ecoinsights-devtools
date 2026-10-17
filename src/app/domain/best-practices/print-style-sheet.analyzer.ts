import { getPrintStylesheetNumber } from "../../../scripts/shared/rules/get-print-stylesheet-number";
import { BestPractice, BestPracticeCompliance } from "../models/best-practice";
import { FrameBestPracticeAnalyzer } from "./best-practice-analyzer";

export default class PrintStyleSheetAnalyzer
  implements FrameBestPracticeAnalyzer
{
  private _id = "PrintStyleSheet";
  private _complianceLevel: BestPracticeCompliance = "C";
  private _printStyleSheetsNumber = 0;

  get bestPractice(): BestPractice {
    return {
      id: this._id,
      name: "Fournir une print css",
      detail:
        this._printStyleSheetsNumber > 0
          ? "La page dispose d'une print css"
          : "Pas de Print CSS trouvée",
      compliance: this._complianceLevel,
    };
  }

  async analyzeFrame(tabId: number): Promise<void> {
    this._printStyleSheetsNumber = await getPrintStylesheetNumber(tabId);
    this._complianceLevel = this._printStyleSheetsNumber > 0 ? "A" : "C";
  }

  clear(): void {
    this._printStyleSheetsNumber = 0;
  }
}
