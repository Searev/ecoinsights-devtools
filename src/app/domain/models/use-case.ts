export interface UseCase {
  id: string;
  iterationsOverYear: number;
  steps: Array<{
    name: string;
    triggerUrl: string;
  }>;
}
