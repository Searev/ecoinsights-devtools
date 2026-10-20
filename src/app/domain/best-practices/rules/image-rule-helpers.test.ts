import { describe, expect, it } from "vitest";
import {
  fileLabel,
  findingFromState,
  formatKo,
  gradeByShare,
  lineFindings,
  notEvaluatedLabel,
  offenderLines,
  summariseImageFindings,
} from "./image-rule-helpers";
import { ImageFinding } from "../../models/image-estimation";
import { estimated as estimatedOutcome } from "../testing/image-fixtures";

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

describe("lineFindings (US-004: order of the persisted lines)", () => {
  const estimated = (url: string, gainBytes: number): ImageFinding => ({
    url,
    originalBytes: 200_000,
    state: "estimated",
    estimatedBytes: 200_000 - gainBytes,
    gainBytes,
    offender: gainBytes >= 10_000,
    declaredType: "image/jpeg",
  });
  const failed = (url: string): ImageFinding => ({
    url,
    originalBytes: 0,
    state: "failed",
    reason: "bytes-unavailable",
    offender: false,
    declaredType: "image/jpeg",
  });
  const pending = (url: string): ImageFinding => ({
    url,
    originalBytes: 0,
    state: "pending",
    offender: false,
    declaredType: "image/jpeg",
  });

  it("lists offenders by gain (desc, then URL) then not-evaluated images, skipping the others", () => {
    const findings = [
      failed("https://x.org/f.jpg"),
      estimated("https://x.org/b.jpg", 50_000),
      estimated("https://x.org/small.jpg", 5_000),
      estimated("https://x.org/a.jpg", 50_000),
      estimated("https://x.org/c.jpg", 90_000),
      { ...failed("https://x.org/gif.gif"), state: "skipped" as const, reason: "unsupported-format" as const },
    ];
    expect(lineFindings(findings).map((f) => f.url)).toEqual([
      "https://x.org/c.jpg",
      "https://x.org/a.jpg",
      "https://x.org/b.jpg",
      "https://x.org/f.jpg",
    ]);
  });

  it("is empty while any finding is pending (no lines are produced)", () => {
    expect(lineFindings([estimated("https://x.org/a.jpg", 50_000), pending("https://x.org/p.jpg")])).toEqual([]);
  });

  it("matches the lines of summariseImageFindings one to one, each line starting with the file label", () => {
    const findings = [
      failed("https://x.org/f.jpg"),
      estimated("https://x.org/b.jpg", 50_000),
      estimated("https://x.org/a.jpg", 70_000),
    ];
    const result = summariseImageFindings(findings, {
      detailPrefix: "",
      extraEvaluatedBytes: 0,
      offenderPhrase: (n) => `${n}`,
      noOffenderDetail: "none",
      offenderLine: (f) => `${f.url.split("/").pop()} : gain ${f.gainBytes}`,
    });
    const ordered = lineFindings(findings);
    expect(result.offenders).toHaveLength(ordered.length);
    ordered.forEach((f, i) => {
      expect(result.offenders![i].startsWith(`${f.url.split("/").pop()} : `)).toBe(true);
    });
  });
});

describe("findingFromState (US-005: sourceBytes and natural size)", () => {
  const base = { url: "https://x.org/a.jpg", declaredType: "image/jpeg", target: undefined };

  it("records sourceBytes and the natural size of an estimated outcome", () => {
    const f = findingFromState(base, estimatedOutcome(240_000, 60_000, { width: 1200, height: 800 }), 250_000);
    expect(f.sourceBytes).toBe(240_000);
    expect(f.natural).toEqual({ width: 1200, height: 800 });
    expect(f.originalBytes).toBe(250_000);
  });

  it("keeps the natural size provided by the base", () => {
    const f = findingFromState(
      { ...base, natural: { width: 1000, height: 500 } },
      estimatedOutcome(240_000, 60_000, { width: 1200, height: 800 }),
      undefined
    );
    expect(f.natural).toEqual({ width: 1000, height: 500 });
  });

  it("sets neither field when not estimated", () => {
    for (const state of [
      undefined,
      { status: "failed" as const, reason: "timeout" as const },
      { status: "skipped" as const, reason: "too-large" as const },
    ]) {
      const f = findingFromState(base, state, 1000);
      expect(f.sourceBytes).toBeUndefined();
      expect(f.natural).toBeUndefined();
    }
  });
});
