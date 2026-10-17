import { BestPractice } from "../models/best-practice";

export type HarBestPracticeAnalyzer = {
  bestPractice: BestPractice;
  analyzerHar(harEntry: HARFormatEntry): void;
  clear(): void;
};

export type FrameBestPracticeAnalyzer = {
  bestPractice: BestPractice;
  analyzeFrame(tabId: number): Promise<void>;
  clear(): void;
};

export type BestPracticeAnalyzer =
  | HarBestPracticeAnalyzer
  | FrameBestPracticeAnalyzer;
