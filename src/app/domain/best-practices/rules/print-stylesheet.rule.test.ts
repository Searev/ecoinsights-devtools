// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { printStylesheetRule } from "./print-stylesheet.rule";

describe("printStylesheetRule metadata", () => {
  it("has the expected id and category", () => {
    expect(printStylesheetRule.id).toBe("PrintStyleSheet");
    expect(printStylesheetRule.category).toBe("css");
  });
});

describe("printStylesheetRule.evaluate", () => {
  const ev = (page: number | undefined) =>
    printStylesheetRule.evaluate({ url: "https://x.test", requests: [], page });

  it.each([
    [1, "A"],
    [3, "A"],
    [0, "C"],
  ])("count %s gives %s", (count, compliance) => {
    expect(ev(count).compliance).toBe(compliance);
  });

  it("explains the result", () => {
    expect(ev(1).detail).toBe("La page dispose d'une print css");
    expect(ev(0).detail).toBe("Pas de Print CSS trouvée");
  });

  it("does not penalise when the page could not be inspected", () => {
    const r = ev(undefined);
    expect(r.compliance).toBe("A");
    expect(r.detail).toMatch(/n'a pas pu être inspectée/);
  });
});

describe("printStylesheetRule.collect", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("counts link and style elements targeting print", () => {
    document.head.innerHTML = `
      <link rel="stylesheet" href="a.css" media="print">
      <link rel="stylesheet" href="b.css" media="screen, print">
      <style media="print">a{}</style>
      <link rel="stylesheet" href="c.css">
      <style>a{}</style>`;
    expect(printStylesheetRule.collect!()).toBe(3);
  });

  it("returns 0 without print stylesheet", () => {
    document.head.innerHTML = `<link rel="stylesheet" href="c.css">`;
    expect(printStylesheetRule.collect!()).toBe(0);
  });
});
