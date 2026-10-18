import { describe, expect, it } from "vitest";
import {
  isQuotaExceeded,
  parseStoredData,
  serializeStoredData,
} from "./store-codec";

const legacy = JSON.stringify({
  services: [],
  analysis: [
    {
      id: "a1",
      date: "2024-01-02T03:04:05.000Z",
      service: { id: "s", name: "n", description: "", url: "https://x.org" },
      pages: [
        {
          title: "Home",
          url: "https://x.org/",
          navigatedAt: "2024-01-02T03:04:06.000Z",
          requests: [{ method: "GET", url: "https://x.org/a.js", code: 200, type: "", responseSize: 1, transferSize: 1 }],
          domProfile: [{ domSize: 10, date: "2024-01-02T03:04:07.000Z" }],
          maxDomSize: 10,
          requestSizeInKb: 0,
          impact: {},
          bestPractices: [
            { id: "old", name: "Old", compliance: "B", detail: "d" },
            { id: "new", name: "New", category: "images", compliance: "A", detail: "d" },
          ],
        },
        {
          title: "No BP",
          url: "https://x.org/2",
          navigatedAt: "2024-01-02T03:04:08.000Z",
          requests: [],
          domProfile: [],
          maxDomSize: 0,
          requestSizeInKb: 0,
          impact: {},
        },
      ],
    },
  ],
});

describe("parseStoredData", () => {
  it("rehydrates Date and URL objects", () => {
    const { analysis } = parseStoredData(legacy);
    const page = analysis[0].pages[0];
    expect(analysis[0].date).toBeInstanceOf(Date);
    expect(page.navigatedAt).toBeInstanceOf(Date);
    expect(page.requests[0].url).toBeInstanceOf(URL);
    expect(page.domProfile[0].date).toBeInstanceOf(Date);
  });

  it("migrates legacy best practices without category to content", () => {
    const page = parseStoredData(legacy).analysis[0].pages[0];
    expect(page.bestPractices![0].category).toBe("content");
    expect(page.bestPractices![1].category).toBe("images");
    expect(analysisPage2(legacy).bestPractices).toBeUndefined();
  });

  it("returns empty data on null or invalid JSON", () => {
    expect(parseStoredData(null)).toEqual({ services: [], analysis: [] });
    expect(parseStoredData("{nope")).toEqual({ services: [], analysis: [] });
  });

  it("round-trips through serializeStoredData", () => {
    const parsed = parseStoredData(legacy);
    const again = parseStoredData(serializeStoredData(parsed.services, parsed.analysis));
    expect(again).toEqual(parsed);
  });
});

function analysisPage2(json: string) {
  return parseStoredData(json).analysis[0].pages[1];
}

describe("isQuotaExceeded", () => {
  it("recognises DOM quota errors by name or code", () => {
    expect(isQuotaExceeded({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaExceeded({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceeded({ code: 22 })).toBe(true);
    expect(isQuotaExceeded(new Error("other"))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});
