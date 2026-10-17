export type BestPracticeId = string;

export type BestPracticeCompliance = "A" | "B" | "C";

export interface BestPractice {
  id: BestPracticeId;
  name: string;
  detail: string;
  compliance: BestPracticeCompliance;
}
