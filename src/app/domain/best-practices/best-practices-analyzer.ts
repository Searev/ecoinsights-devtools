import { BestPracticeAnalyzer } from "./best-practice-analyzer";
import { BestPractice } from "../models/best-practice";
import manager from "./best-practice-manager";

export default class BestPracticesAnalyzer {
  rules: BestPracticeAnalyzer[] = [];

  constructor() {
    this.rules = manager.getRules();
  }

  analyzeHarEntry(harEntry: HARFormatEntry) {
    this.rules.forEach((entry) => {
      if ("analyzerHar" in entry) {
        entry.analyzerHar(harEntry);
      }
    });
  }

  async analyzeFrame(tabId: number) {
    await Promise.all(
      this.rules.map((entry) => {
        if ("analyzeFrame" in entry) {
          entry.analyzeFrame(tabId);
        }
      })
    );
  }

  getBestPractices(): BestPractice[] {
    return this.rules.map((el) => el.bestPractice);
  }

  clear() {
    this.rules.forEach((el) => el.clear());
  }
}
