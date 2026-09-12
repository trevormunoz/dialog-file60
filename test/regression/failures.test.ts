import { describe, it, expect } from "vitest";
import { ReconstructionFailure, RECONSTRUCTION_FAILURE_MESSAGE } from "../../src/retrieval/failures";

describe("ReconstructionFailure", () => {
  it("carries a code, an optional url and detail, and the canonical user message", () => {
    const e = new ReconstructionFailure("ArtifactUnavailable", { url: "/corpus/index/CY.json", detail: "HTTP 404" });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("ArtifactUnavailable");
    expect(e.url).toBe("/corpus/index/CY.json");
    expect(e.detail).toBe("HTTP 404");
    expect(e.message).toBe(RECONSTRUCTION_FAILURE_MESSAGE);
  });
  it("is distinguishable with instanceof", () => {
    expect(new ReconstructionFailure("IndexInconsistent") instanceof ReconstructionFailure).toBe(true);
  });
});
