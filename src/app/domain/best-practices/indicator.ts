import {
  BestPracticeIndicator,
  COUNT_INDICATOR_UNITS,
  PRESENCE_INDICATOR_UNITS,
  RATIO_INDICATOR_UNITS,
} from "../models/best-practice";

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOneOf(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

/** US-029: guards a persisted indicator (ARCH-DECISION-033). Anything unexpected is rejected. */
export function isBestPracticeIndicator(value: unknown): value is BestPracticeIndicator {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case "ratio":
      return (
        isOneOf(RATIO_INDICATOR_UNITS, v.unit) &&
        isCount(v.offenders) &&
        isCount(v.expected) &&
        v.offenders <= v.expected
      );
    case "count":
      return isOneOf(COUNT_INDICATOR_UNITS, v.unit) && isCount(v.offenders);
    case "presence":
      return isOneOf(PRESENCE_INDICATOR_UNITS, v.unit) && typeof v.present === "boolean";
    default:
      return false;
  }
}
