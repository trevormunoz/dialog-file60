import { describe, it, expect } from "vitest";
import { checkPhraseManifest } from "../../src/retrieval/manifest";

describe("checkPhraseManifest", () => {
  it("passes when every loaded index count matches the manifest", () => {
    const indexes = { CY: { code: "CY", terms: { A: [0], B: [1] } } };
    expect(() => checkPhraseManifest(indexes, { CY: 2 })).not.toThrow();
  });
  it("passes when a code is recorded 0 and served empty", () => {
    const indexes = { GY: { code: "GY", terms: {} } };
    expect(() => checkPhraseManifest(indexes, { GY: 0 })).not.toThrow();
  });
  it("throws IndexInconsistent when a served index is empty but the manifest says N", () => {
    const indexes = { CY: { code: "CY", terms: {} } };
    expect(() => checkPhraseManifest(indexes, { CY: 4127 })).toThrowError(/reconstruction could not load/i);
  });
  it("throws IndexInconsistent on any count drift", () => {
    const indexes = { CY: { code: "CY", terms: { A: [0] } } };
    try { checkPhraseManifest(indexes, { CY: 2 }); throw new Error("did not throw"); }
    catch (e: any) { expect(e.code).toBe("IndexInconsistent"); }
  });
});
