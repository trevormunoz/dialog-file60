import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJsonArtifact, isWordShard, isIndex } from "../../src/retrieval/artifact";
import { ReconstructionFailure } from "../../src/retrieval/failures";

const stubFetch = (init: { ok?: boolean; status?: number; body?: unknown; json?: () => Promise<unknown> }) => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "",
    json: init.json ?? (async () => init.body),
  })));
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchJsonArtifact", () => {
  it("returns parsed data when ok and shape-valid", async () => {
    stubFetch({ body: { A: [1, 2] } });
    expect(await fetchJsonArtifact("/x", isWordShard)).toEqual({ A: [1, 2] });
  });
  it("throws ArtifactUnavailable on non-ok", async () => {
    stubFetch({ ok: false, status: 404 });
    await expect(fetchJsonArtifact("/x", isWordShard)).rejects.toMatchObject({ code: "ArtifactUnavailable" });
  });
  it("throws ArtifactInvalid on unparseable JSON", async () => {
    stubFetch({ json: async () => { throw new SyntaxError("bad"); } });
    await expect(fetchJsonArtifact("/x", isWordShard)).rejects.toMatchObject({ code: "ArtifactInvalid", detail: expect.stringContaining("JSON") });
  });
  it("throws ArtifactInvalid on wrong shape (HTML string / array where object expected)", async () => {
    stubFetch({ body: "<!doctype html>" });
    await expect(fetchJsonArtifact("/x", isWordShard)).rejects.toBeInstanceOf(ReconstructionFailure);
  });
  it("isIndex accepts a well-formed phrase index and rejects an empty-shape one", () => {
    expect(isIndex({ code: "CY", terms: { BELTSVILLE: [0] } })).toBe(true);
    expect(isIndex({ code: "CY" })).toBe(false);
    expect(isIndex({ terms: {} })).toBe(false);
  });
});
