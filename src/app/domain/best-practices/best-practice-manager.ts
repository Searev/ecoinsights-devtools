import { BestPracticeAnalyzer } from "./best-practice-analyzer";
import DontResizeImagesInBrowserAnalyzer from "./dont-resize-images-in-browse.analyzer";
import PrintStyleSheetAnalyzer from "./print-style-sheet.analyzer";

class BestPraticesManager {
  private _analyzers: BestPracticeAnalyzer[] = [
    new PrintStyleSheetAnalyzer(),
    new DontResizeImagesInBrowserAnalyzer(),
  ];

  register(analyzer: BestPracticeAnalyzer) {
    this._analyzers.push(analyzer);
  }

  getRules(): BestPracticeAnalyzer[] {
    return this._analyzers;
  }
}

const manager = new BestPraticesManager();

export default manager;
