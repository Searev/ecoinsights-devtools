import { vi } from "vitest";
import {
  EstimationJob,
  EstimationOutcome,
  ImageTransform,
} from "../../models/image-estimation";
import { ImageEstimator } from "../../models/image-estimator";

interface FakeCall {
  job: EstimationJob;
  settled: boolean;
  resolve: (outcome: EstimationOutcome) => void;
}

/**
 * Test double of the `ImageEstimator` port: every `estimate()` call is recorded and stays pending
 * until the test settles it by hand.
 */
export class DeferredImageEstimator implements ImageEstimator {
  calls: FakeCall[] = [];
  cancel = vi.fn();

  estimate(job: EstimationJob): Promise<EstimationOutcome> {
    return new Promise((resolve) => {
      const call: FakeCall = {
        job,
        settled: false,
        resolve: (outcome) => {
          call.settled = true;
          resolve(outcome);
        },
      };
      this.calls.push(call);
    });
  }

  /** Jobs requested so far, in call order. */
  get jobs(): EstimationJob[] {
    return this.calls.map((c) => c.job);
  }

  jobsOfKind(kind: ImageTransform["kind"]): EstimationJob[] {
    return this.jobs.filter((j) => j.transform.kind === kind);
  }

  /** Settles the oldest unsettled call matching `kind` (and `url` when given). Returns false when none. */
  settle(
    kind: ImageTransform["kind"],
    outcome: EstimationOutcome,
    url?: string
  ): boolean {
    const call = this.calls.find(
      (c) =>
        !c.settled &&
        c.job.transform.kind === kind &&
        (url === undefined || c.job.url === url)
    );
    if (call === undefined) return false;
    call.resolve(outcome);
    return true;
  }
}
