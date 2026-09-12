import { describe, it, expect, vi, afterEach } from "vitest";
import { FetchWordIndex } from "../../src/retrieval/words";

afterEach(() => vi.unstubAllGlobals());

describe("FetchWordIndex validates artifacts", () => {
  it("throws ArtifactUnavailable when a shard 404s", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) })));
    await expect(new FetchWordIndex({}).shard("/TI", "A")).rejects.toMatchObject({ code: "ArtifactUnavailable" });
  });
  it("throws ArtifactInvalid when a shard returns HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, statusText: "", json: async () => "<html>" })));
    await expect(new FetchWordIndex({}).shard("/TI", "A")).rejects.toMatchObject({ code: "ArtifactInvalid" });
  });
  it("returns the shard when valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, statusText: "", json: async () => ({ APPLE: [3] }) })));
    expect(await new FetchWordIndex({}).shard("/TI", "A")).toEqual({ APPLE: [3] });
  });
});
