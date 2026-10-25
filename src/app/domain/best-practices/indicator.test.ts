import { describe, expect, it } from "vitest";
import {
  COUNT_INDICATOR_UNITS,
  PRESENCE_INDICATOR_UNITS,
  RATIO_INDICATOR_UNITS,
} from "../models/best-practice";
import { isBestPracticeIndicator } from "./indicator";

describe("isBestPracticeIndicator", () => {
  it("accepts every unit of its own kind", () => {
    for (const unit of RATIO_INDICATOR_UNITS) {
      expect(isBestPracticeIndicator({ kind: "ratio", offenders: 1, expected: 2, unit })).toBe(true);
    }
    for (const unit of COUNT_INDICATOR_UNITS) {
      expect(isBestPracticeIndicator({ kind: "count", offenders: 3, unit })).toBe(true);
    }
    for (const unit of PRESENCE_INDICATOR_UNITS) {
      expect(isBestPracticeIndicator({ kind: "presence", present: false, unit })).toBe(true);
    }
  });

  it("accepts zero and equal offenders / expected", () => {
    expect(isBestPracticeIndicator({ kind: "ratio", offenders: 0, expected: 0, unit: "uncached-files" })).toBe(true);
    expect(isBestPracticeIndicator({ kind: "ratio", offenders: 4, expected: 4, unit: "uncached-files" })).toBe(true);
    expect(isBestPracticeIndicator({ kind: "count", offenders: 0, unit: "requests" })).toBe(true);
  });

  it("rejects non-objects and unknown kinds", () => {
    for (const v of [undefined, null, 3, "ratio", [], { kind: "other", offenders: 1, unit: "requests" }, {}]) {
      expect(isBestPracticeIndicator(v)).toBe(false);
    }
  });

  it("rejects a unit that belongs to another kind or is unknown", () => {
    expect(isBestPracticeIndicator({ kind: "ratio", offenders: 1, expected: 2, unit: "requests" })).toBe(false);
    expect(isBestPracticeIndicator({ kind: "count", offenders: 1, unit: "uncached-files" })).toBe(false);
    expect(isBestPracticeIndicator({ kind: "count", offenders: 1, unit: "nope" })).toBe(false);
    expect(isBestPracticeIndicator({ kind: "presence", present: true, unit: "requests" })).toBe(false);
  });

  it("rejects negative, fractional, non-finite, unsafe and string numbers", () => {
    const ratio = (offenders: unknown, expected: unknown) => ({ kind: "ratio", offenders, expected, unit: "uncached-files" });
    expect(isBestPracticeIndicator(ratio(-1, 2))).toBe(false);
    expect(isBestPracticeIndicator(ratio(1, -2))).toBe(false);
    expect(isBestPracticeIndicator(ratio(1.5, 2))).toBe(false);
    expect(isBestPracticeIndicator(ratio(NaN, 2))).toBe(false);
    expect(isBestPracticeIndicator(ratio(1, Infinity))).toBe(false);
    expect(isBestPracticeIndicator(ratio("1", 2))).toBe(false);
    expect(isBestPracticeIndicator(ratio(1, Number.MAX_SAFE_INTEGER + 1))).toBe(false);
    expect(isBestPracticeIndicator({ kind: "count", offenders: "3", unit: "requests" })).toBe(false);
    expect(isBestPracticeIndicator({ kind: "count", offenders: -3, unit: "requests" })).toBe(false);
    expect(isBestPracticeIndicator({ kind: "count", unit: "requests" })).toBe(false);
  });

  it("rejects a ratio with offenders above expected", () => {
    expect(isBestPracticeIndicator({ kind: "ratio", offenders: 3, expected: 2, unit: "uncached-files" })).toBe(false);
  });

  it("rejects a presence without a boolean", () => {
    expect(isBestPracticeIndicator({ kind: "presence", present: "no", unit: "print-css" })).toBe(false);
    expect(isBestPracticeIndicator({ kind: "presence", unit: "print-css" })).toBe(false);
  });
});
