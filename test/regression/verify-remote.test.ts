import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyRemote } from "../../scripts/verify-remote";
import { registry } from "../../src/registry";
import type { Fixity } from "../../src/loader/fixity";
import { WORD_CODES } from "../../src/loader/words";
import { wordDir } from "../../src/loader/corpus-urls";
import { PHRASE_FIELDS } from "../../src/loader/corpus-format";

// verifyRemote is the deploy-time check that the public copy of the
// corpus is the corpus: the whole object's sha256 against the registry, plus a spot Range
// GET at a known offset compared byte-for-byte against the committed fixture. These tests
// drive it with a stubbed fetch -- a Vitest test never touches the network and never spawns
// a subprocess (test/regression/no-subprocess.test.ts).
const FIXTURE = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const FIXTURE_OFFSET = 6810182; // byte offset of line 83052
const fixity = registry.get("nara.file.fy1994_fixity").value as Fixity;

function stubFetch(corpus: Uint8Array, indexBodies: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const range = (init?.headers as Record<string, string> | undefined)?.Range;
    if (url.endsWith("RG164.CRIS.FY94.txt")) {
      // cast: BodyInit wants Uint8Array<ArrayBuffer>, but the plain `Uint8Array` parameter
      // type above widens to Uint8Array<ArrayBufferLike> under this TS/lib combination.
      if (!range) return new Response(corpus as Uint8Array<ArrayBuffer>, { status: 200 });
      const [from, to] = range.replace("bytes=", "").split("-").map(Number);
      return new Response(corpus.slice(from!, to! + 1) as Uint8Array<ArrayBuffer>, { status: 206 });
    }
    const body = indexBodies[url];
    if (body === undefined) return new Response("", { status: 404, statusText: "Not Found" });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

// A synthetic corpus that matches the registry's recorded fixity is impossible to build in a
// test, so these tests register a locally computed fixity instead and assert the comparison
// logic, not the real hash. The real hash is checked by `pnpm verify:remote` against R2.
const synthetic = new Uint8Array(FIXTURE_OFFSET + FIXTURE.length + 82);
synthetic.set(FIXTURE, FIXTURE_OFFSET);
const syntheticFixity: Fixity = {
  bytes: synthetic.length,
  sha256: createHash("sha256").update(synthetic).digest("hex"),
};
// Derived from PHRASE_FIELDS, not hand-typed, so this stub never drifts from the real list of
// built phrase indexes verifyRemote() actually fetches.
const INDEX_CODES = PHRASE_FIELDS;
// Every WORD_CODE's terms.json holds one term, "A", so the deterministic first-term shard is
// always A.json -- keeps the stub small while still exercising the real shardOf() choice.
const wordUrls = WORD_CODES.flatMap(code => {
  const dir = wordDir(code);
  return [
    [`https://corpus.example/v1/word/${dir}/terms.json`, '[["A",1]]'],
    [`https://corpus.example/v1/word/${dir}/A.json`, '{"A":[0]}'],
  ] as [string, string][];
});
const okIndexes = Object.fromEntries([
  ["https://corpus.example/v1/offsets.json", '{"file":"RG164.CRIS.FY94.txt","sha256":"x","records":[]}'],
  ...INDEX_CODES.map(c => [`https://corpus.example/v1/index/${c}.json`, `{"code":"${c}","terms":{}}`]),
  ...wordUrls,
]);

test("a matching object passes and reports the corpus size, the 206 and every index", async () => {
  const report = await verifyRemote("https://corpus.example/v1/", {
    fetchImpl: stubFetch(synthetic, okIndexes),
    expected: syntheticFixity,
    fixture: FIXTURE,
    fixtureOffset: FIXTURE_OFFSET,
  });
  expect(report.corpusBytes).toBe(synthetic.length);
  expect(report.corpusSha256).toBe(syntheticFixity.sha256);
  expect(report.rangeStatus).toBe(206);
  expect(report.rangeBytes).toBe(FIXTURE.length);
  expect(report.rangeMatchesFixtureBytes).toBe(true);
  expect(report.indexes.map(i => i.code)).toEqual(INDEX_CODES);
  expect(report.words.map(w => w.code)).toEqual([...WORD_CODES]);
  for (const w of report.words) {
    expect(w.shard, w.code).toBe("A");
    expect(w.termsBytes, w.code).toBeGreaterThan(0);
    expect(w.shardBytes, w.code).toBeGreaterThan(0);
  }
});

test("a missing word terms.json fails with the URL and the status", async () => {
  const missing = { ...okIndexes };
  delete missing[`https://corpus.example/v1/word/${wordDir("/TI")}/terms.json`];
  await expect(verifyRemote("https://corpus.example/v1/", {
    fetchImpl: stubFetch(synthetic, missing),
    expected: syntheticFixity,
    fixture: FIXTURE,
    fixtureOffset: FIXTURE_OFFSET,
  })).rejects.toThrow(/word\/TI\/terms\.json: HTTP 404/);
});

test("a missing word shard fails with the URL and the status", async () => {
  const missing = { ...okIndexes };
  delete missing[`https://corpus.example/v1/word/${wordDir("/TI")}/A.json`];
  await expect(verifyRemote("https://corpus.example/v1/", {
    fetchImpl: stubFetch(synthetic, missing),
    expected: syntheticFixity,
    fixture: FIXTURE,
    fixtureOffset: FIXTURE_OFFSET,
  })).rejects.toThrow(/word\/TI\/A\.json: HTTP 404/);
});

test("a corpus whose bytes differ fails with the registry's expected and the actual values", async () => {
  const corrupted = synthetic.slice();
  corrupted[FIXTURE_OFFSET] = corrupted[FIXTURE_OFFSET]! ^ 0xff;
  await expect(verifyRemote("https://corpus.example/v1/", {
    fetchImpl: stubFetch(corrupted, okIndexes),
    expected: syntheticFixity,
    fixture: FIXTURE,
    fixtureOffset: FIXTURE_OFFSET,
  })).rejects.toThrow(/does not match its recorded fixity/);
});

test("a host that ignores Range fails loudly instead of passing on a 200", async () => {
  const noRange = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("RG164.CRIS.FY94.txt")) return new Response(synthetic, { status: 200 });
    return new Response(okIndexes[url] ?? "", { status: okIndexes[url] ? 200 : 404 });
  }) as typeof fetch;
  await expect(verifyRemote("https://corpus.example/v1/", {
    fetchImpl: noRange,
    expected: syntheticFixity,
    fixture: FIXTURE,
    fixtureOffset: FIXTURE_OFFSET,
  })).rejects.toThrow(/range request not honored/);
});

test("a missing index file names the URL and the status", async () => {
  const missing = { ...okIndexes };
  delete missing["https://corpus.example/v1/index/SF.json"];
  await expect(verifyRemote("https://corpus.example/v1/", {
    fetchImpl: stubFetch(synthetic, missing),
    expected: syntheticFixity,
    fixture: FIXTURE,
    fixtureOffset: FIXTURE_OFFSET,
  })).rejects.toThrow(/index\/SF\.json: HTTP 404/);
});

test("the default expected fixity is the registry's, not a hand-typed hash", async () => {
  expect(fixity.bytes).toBe(277539004);
  expect(fixity.sha256).toBe("437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a");
});
