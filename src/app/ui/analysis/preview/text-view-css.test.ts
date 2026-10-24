import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SYNTAX_PALETTE, TEXT_VIEW_BACKGROUND, TEXT_VIEW_GUTTER, TEXT_VIEW_TEXT } from "./syntax/syntax-palette";
import { TokenKind } from "./syntax/syntax-types";

const css = readFileSync(join(__dirname, "text-view.css"), "utf8");

/** Declarations of the first rule whose selector list is exactly `selector`. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  return match?.[1] ?? "";
}

describe("text-view.css", () => {
  it.each(Object.keys(SYNTAX_PALETTE) as TokenKind[])("colours .syntax-%s from its custom property", (kind) => {
    expect(declarations(`.syntax-${kind}`)).toContain(`color: var(--syntax-${kind})`);
  });

  it("italicises comments", () => {
    expect(declarations(".syntax-comment")).toContain("font-style: italic");
  });

  it("uses the palette literals for background, text and gutter", () => {
    expect(declarations(".text-view")).toContain(`background: ${TEXT_VIEW_BACKGROUND}`);
    expect(declarations(".text-view")).toContain(`color: ${TEXT_VIEW_TEXT}`);
    expect(declarations(".text-gutter")).toContain(`color: ${TEXT_VIEW_GUTTER}`);
  });

  it("shows the line number from data-line and keeps it out of selections", () => {
    expect(declarations(".text-gutter::before")).toContain("content: attr(data-line)");
    expect(declarations(".text-gutter")).toContain("user-select: none");
  });

  it("wraps long lines and never scrolls horizontally", () => {
    expect(declarations(".text-code")).toContain("white-space: pre-wrap");
    expect(declarations(".text-code")).toContain("overflow-wrap: anywhere");
    expect(declarations(".text-view")).toContain("overflow-x: hidden");
  });

  it("has a visible focus outline", () => {
    expect(declarations(".text-view:focus-visible")).toContain("outline:");
  });
});
