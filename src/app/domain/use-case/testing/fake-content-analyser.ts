import { vi } from "vitest";
import { ContentAnalyser } from "../../models/content-analyser";
import { ContentJob, ContentOutcome } from "../../models/text-content";

interface FakeCall {
  job: ContentJob;
  settled: boolean;
  resolve: (outcome: ContentOutcome) => void;
}

/**
 * Test double of the `ContentAnalyser` port: every `analyse()` call is recorded and stays pending
 * until the test settles it by hand.
 */
export class DeferredContentAnalyser implements ContentAnalyser {
  calls: FakeCall[] = [];
  cancel = vi.fn();

  analyse(job: ContentJob): Promise<ContentOutcome> {
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
  get jobs(): ContentJob[] {
    return this.calls.map((c) => c.job);
  }

  /** Settles the oldest unsettled call (for `url` when given). Returns false when none. */
  settle(outcome: ContentOutcome, url?: string): boolean {
    const call = this.calls.find((c) => !c.settled && (url === undefined || c.job.url === url));
    if (call === undefined) return false;
    call.resolve(outcome);
    return true;
  }
}
