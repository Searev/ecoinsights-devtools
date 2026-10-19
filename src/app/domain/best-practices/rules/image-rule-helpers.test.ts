import { describe, expect, it } from "vitest";
import {
  fileLabel,
  formatKo,
  gradeByShare,
  notEvaluatedLabel,
  offenderLines,
} from "./image-rule-helpers";

describe("gradeByShare", () => {
  it.each([
    [50_000, "A"],
    [99_999, "A"],
    [100_000, "B"],
    [300_000, "B"],
    [301_000, "C"],
    [300_001, "C"],
  ])("gain %s over 1 000 kB gives %s", (gain, grade) => {
    expect(gradeByShare(gain, 1_000_000)).toBe(grade);
  });

  it("is A when nothing was evaluated", () => {
    expect(gradeByShare(0, 0)).toBe("A");
  });
});

describe("formatKo", () => {
  it("rounds to whole kilobytes", () => {
    expect(formatKo(180_000)).toBe("180 ko");
    expect(formatKo(144_400)).toBe("144 ko");
    expect(formatKo(144_500)).toBe("145 ko");
  });

  it("groups thousands the French way", () => {
    expect(formatKo(1_234_000).replace(/\s/g, " ")).toBe("1 234 ko");
  });
});

describe("fileLabel", () => {
  it("is the last non-empty path segment, decoded", () => {
    expect(fileLabel("https://x.test/img/photo.jpg?v=2")).toBe("photo.jpg");
    expect(fileLabel("https://x.test/img/my%20photo.jpg")).toBe("my photo.jpg");
    expect(fileLabel("https://x.test/img/dir/")).toBe("dir");
  });

  it("falls back to the host", () => {
    expect(fileLabel("https://x.test/")).toBe("x.test");
  });

  it("survives malformed input", () => {
    expect(fileLabel("not a url")).toBe("not a url");
    expect(fileLabel("https://x.test/%E0%A4%A.jpg")).toBe("%E0%A4%A.jpg");
  });
});

describe("notEvaluatedLabel", () => {
  it.each([
    ["too-large", "image trop volumineuse"],
    ["bytes-unavailable", "contenu de l'image indisponible"],
    ["decode-failed", "échec du décodage"],
    ["encode-failed", "échec de l'encodage"],
    ["timeout", "délai d'estimation dépassé"],
    ["estimator-unavailable", "estimation indisponible"],
    ["analysis-stopped", "analyse arrêtée"],
  ] as const)("%s", (reason, label) => {
    expect(notEvaluatedLabel(reason)).toBe(label);
  });
});

describe("offenderLines", () => {
  it("keeps up to 20 lines untouched", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `l${i}`);
    expect(offenderLines(lines)).toEqual(lines);
  });

  it("caps at 20 lines then counts the others", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `l${i}`);
    const out = offenderLines(lines);
    expect(out).toHaveLength(21);
    expect(out[19]).toBe("l19");
    expect(out[20]).toBe("… et 5 autres images");
  });

  it("uses the singular for one remaining image", () => {
    const lines = Array.from({ length: 21 }, (_, i) => `l${i}`);
    expect(offenderLines(lines)[20]).toBe("… et 1 autre image");
  });
});
