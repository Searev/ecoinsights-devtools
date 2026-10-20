import { describe, expect, it } from "vitest";
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { formatCount } from "../../../domain/best-practices/rules/rule-lines";
import { IframePreviewSubject } from "../../../domain/models/file-preview";
import { iframeInfoRows } from "./iframe-format";

const base: IframePreviewSubject = {
  kind: "iframe",
  ruleId: "UseLazyLoading",
  url: "https://www.google.com/maps/embed?pb=1",
  host: "www.google.com",
};

describe("iframeInfoRows", () => {
  it("lists the data of the iframe (US-017 S1)", () => {
    expect(iframeInfoRows({ ...base, mimeType: "text/html", transferredBytes: 48_000, top: 2100 })).toEqual([
      { label: "Hôte", value: "www.google.com" },
      { label: "Type", value: "text/html" },
      { label: "Poids transféré", value: formatKo(48_000) },
      { label: "Position", value: `à ${formatCount(2100)} px du haut de page` },
    ]);
  });

  it("shows unknown values when nothing was recorded (S2)", () => {
    expect(iframeInfoRows(base)).toEqual([
      { label: "Hôte", value: "www.google.com" },
      { label: "Type", value: "inconnu" },
      { label: "Poids transféré", value: "non mesuré" },
      { label: "Position", value: "inconnue" },
    ]);
  });

  it("keeps a zero weight and a zero position", () => {
    const rows = iframeInfoRows({ ...base, transferredBytes: 0, top: 0 });
    expect(rows[2].value).toBe(formatKo(0));
    expect(rows[3].value).toBe("à 0 px du haut de page");
  });

  it("treats an empty type as unknown", () => {
    expect(iframeInfoRows({ ...base, mimeType: "" })[1].value).toBe("inconnu");
  });
});
