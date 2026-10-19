import { describe, expect, it } from "vitest";
import { decodeBase64 } from "./base64";

describe("decodeBase64", () => {
  it("decodes bytes, including values above 127", () => {
    expect(Array.from(decodeBase64("/9j/AA=="))).toEqual([0xff, 0xd8, 0xff, 0x00]);
  });

  it("decodes an empty string to no bytes", () => {
    expect(decodeBase64("").length).toBe(0);
  });

  it("throws on invalid base64", () => {
    expect(() => decodeBase64("***not base64***")).toThrow();
  });
});
