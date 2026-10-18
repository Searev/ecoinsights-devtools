import { describe, expect, it } from "vitest";
import { AgentError } from "../../../shared/protocol";
import { describeStartError } from "./start-error";

describe("describeStartError", () => {
  it("explains permission and timeout errors in French", () => {
    expect(describeStartError(new AgentError("NO_PERMISSION", "x"))).toContain("permission");
    expect(describeStartError(new AgentError("TIMEOUT", "x"))).toContain("ne répond pas");
  });
  it("falls back for unknown errors", () => {
    expect(describeStartError(new Error("x"))).toContain("inattendue");
    expect(describeStartError(new AgentError("INTERNAL", "boom"))).toContain("boom");
  });
});
