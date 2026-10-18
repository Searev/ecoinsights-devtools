import { describe, expect, it } from "vitest";
import { isNotOnSamePage } from "../app/helpers/url.helper";

describe("test harness", () => {
  it("runs TypeScript tests against app code", () => {
    expect(isNotOnSamePage("https://a.org/x#1", "https://a.org/x#2")).toBe(false);
  });
});
