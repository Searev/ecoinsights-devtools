import { describe, expect, it } from "vitest";
import {
  describeAnalysisImageGain,
  describePageImageGain,
  formatGainBytes,
  pageTransferBytes,
  sumAnalysisImageGain,
} from "./image-gain-view";
import { PageAnalysis } from "../../domain/models/page-analysis";
import { PageImageGain } from "../../domain/models/image-estimation";

const gain = (bytes: number, extra: Partial<PageImageGain> = {}): PageImageGain => ({
  bytes,
  pendingCount: 0,
  notEvaluatedCount: 0,
  fallbackCount: 0,
  ...extra,
});

const page = (imageGain?: PageImageGain, transfers: number[] = []) =>
  ({
    imageGain,
    requests: transfers.map((transferSize) => ({ transferSize })),
  } as unknown as PageAnalysis);

describe("formatGainBytes", () => {
  it("uses ko without decimals under 1 000 ko after rounding", () => {
    expect(formatGainBytes(204_000)).toBe("204 ko");
    expect(formatGainBytes(999_400)).toBe("999 ko");
    expect(formatGainBytes(0)).toBe("0 ko");
  });

  it("switches to Mo with one decimal and a French comma", () => {
    expect(formatGainBytes(999_600)).toBe("1,0 Mo");
    expect(formatGainBytes(1_204_000)).toBe("1,2 Mo");
  });
});

describe("describePageImageGain", () => {
  it("shows the gain and its share of the page weight", () => {
    expect(describePageImageGain(gain(204_000), 1_000_000)).toBe(
      "204 ko, soit 20 % du poids de la page"
    );
  });

  it("omits the share when the page weight is unknown", () => {
    expect(describePageImageGain(gain(204_000), 0)).toBe("204 ko");
  });

  it("shows a lower bound while estimations are pending, without share", () => {
    expect(describePageImageGain(gain(120_000, { pendingCount: 2 }), 1_000_000)).toBe(
      "≥ 120 ko (estimation en cours)"
    );
  });

  it("mentions images that could not be evaluated, in plural and singular", () => {
    expect(
      describePageImageGain(gain(80_000, { notEvaluatedCount: 2 }), 1_000_000)
    ).toBe("80 ko (2 images non évaluées), soit 8 % du poids de la page");
    expect(describePageImageGain(gain(80_000, { notEvaluatedCount: 1 }), 0)).toBe(
      "80 ko (1 image non évaluée)"
    );
  });

  it("flags a partial gain when only fallbacks happened", () => {
    expect(describePageImageGain(gain(80_000, { fallbackCount: 1 }), 0)).toBe(
      "80 ko (partiel)"
    );
  });

  it("prefers the not-evaluated count over the partial flag", () => {
    expect(
      describePageImageGain(gain(80_000, { notEvaluatedCount: 1, fallbackCount: 1 }), 0)
    ).toBe("80 ko (1 image non évaluée)");
  });

  it("shows a dash for legacy pages", () => {
    expect(describePageImageGain(undefined, 1_000_000)).toBe("—");
  });
});

describe("sumAnalysisImageGain / describeAnalysisImageGain", () => {
  it("sums the page gains", () => {
    const total = sumAnalysisImageGain([
      page(gain(204_000)),
      page(gain(0)),
      page(gain(1_000_000)),
    ]);
    expect(total).toEqual({
      bytes: 1_204_000,
      pending: false,
      notEvaluatedCount: 0,
      fallbackCount: 0,
    });
    expect(describeAnalysisImageGain(total)).toBe("1,2 Mo");
  });

  it("is a lower bound while a page is pending", () => {
    const total = sumAnalysisImageGain([
      page(gain(1_000_000)),
      page(gain(200_000, { pendingCount: 1 })),
    ]);
    expect(total?.pending).toBe(true);
    expect(describeAnalysisImageGain(total)).toBe("≥ 1,2 Mo (estimation en cours)");
  });

  it("accumulates the not evaluated and fallback counts", () => {
    const total = sumAnalysisImageGain([
      page(gain(1, { notEvaluatedCount: 2 })),
      page(gain(1, { notEvaluatedCount: 1, fallbackCount: 3 })),
    ]);
    expect(total).toMatchObject({ notEvaluatedCount: 3, fallbackCount: 3 });
  });

  it("ignores legacy pages, and is a dash when all pages are legacy", () => {
    const total = sumAnalysisImageGain([page(undefined), page(gain(300_000))]);
    expect(total?.bytes).toBe(300_000);
    const none = sumAnalysisImageGain([page(undefined), page(undefined)]);
    expect(none).toBeUndefined();
    expect(describeAnalysisImageGain(none)).toBe("—");
    expect(sumAnalysisImageGain([])).toBeUndefined();
  });
});

describe("pageTransferBytes", () => {
  it("sums the transfer size of the requests", () => {
    expect(pageTransferBytes(page(undefined, [100, 250, 0]))).toBe(350);
  });
});
