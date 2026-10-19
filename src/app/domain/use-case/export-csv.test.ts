import { describe, expect, it } from "vitest";
import { exportAnalysisToCsv } from "./export-csv";
import { Analysis } from "../models/analysis";
import { PageAnalysis } from "../models/page-analysis";
import { PageImageGain } from "../models/image-estimation";

const GAIN_COLUMN = "Gain images estimé (ko)";

function page(imageGain?: PageImageGain): PageAnalysis {
  return {
    title: "Home",
    url: "https://x.org/",
    navigatedAt: new Date("2024-01-02T03:04:06.000Z"),
    requests: [],
    domProfile: [],
    maxDomSize: 10,
    requestSizeInKb: 1,
    impact: { ecoindex: 50, greenhouseGasEmissions: 1, blueWaterConsumption: 1 },
    bestPractices: [],
    ...(imageGain ? { imageGain } : {}),
  };
}

const gain = (bytes: number, pendingCount = 0): PageImageGain => ({
  bytes,
  pendingCount,
  notEvaluatedCount: 0,
  fallbackCount: 0,
});

function analysisOf(...pages: PageAnalysis[]): Analysis {
  return {
    id: "a",
    date: new Date("2024-01-02T03:04:05.000Z"),
    service: { id: "s", name: "n", description: "", url: "https://x.org" },
    pages,
  };
}

/** Last cell of each data row. */
function lastCells(csv: string): string[] {
  return csv
    .split("\n")
    .slice(1)
    .map((row) => row.split(";").pop()!);
}

describe("exportAnalysisToCsv image gain column", () => {
  it("ends the header with the image gain column", () => {
    const header = exportAnalysisToCsv(analysisOf(page())).split("\n")[0];
    expect(header.endsWith(`;${GAIN_COLUMN}`)).toBe(true);
  });

  it("exports the gain in kB with one decimal and a dot", () => {
    const csv = exportAnalysisToCsv(analysisOf(page(gain(204_000)), page(gain(0))));
    expect(lastCells(csv)).toEqual(["204.0", "0.0"]);
  });

  it("flags a gain that is still pending as partial", () => {
    const csv = exportAnalysisToCsv(analysisOf(page(gain(120_000, 2))));
    expect(lastCells(csv)).toEqual(["120.0 (partiel)"]);
  });

  it("leaves the cell empty for a page without image gain", () => {
    const csv = exportAnalysisToCsv(analysisOf(page()));
    expect(lastCells(csv)).toEqual([""]);
  });

  it("keeps the other columns unchanged", () => {
    const header = exportAnalysisToCsv(analysisOf(page())).split("\n")[0].split(";");
    expect(header).toHaveLength(11);
    expect(header.slice(0, 3)).toEqual(["Titre de la page", "URL", "Date"]);
    expect(header[9]).toBe("Note");
  });
});
