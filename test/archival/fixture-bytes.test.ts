import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FsRangeReader } from "../../src/retrieval/reader-node";

// Both test/archival/render5-9049442.test.ts and provenance.test.ts read
// only the committed fixture, never the corpus it claims to be. This test reads each corpus
// at its fixture's recorded offset and asserts byte equality, so a stale or hand-edited
// fixture is caught. Each expected sha256 is read from packages/cris-formatb/fixtures/SOURCES.md
// rather than duplicated here as a second literal.
const SOURCES = "packages/cris-formatb/fixtures/SOURCES.md";
const sourcesText = readFileSync(SOURCES, "utf8");

function shaFor(fixtureName: string): string {
  const at = sourcesText.indexOf(fixtureName);
  expect(at, `${SOURCES} does not mention ${fixtureName}`).toBeGreaterThanOrEqual(0);
  const sha = sourcesText.slice(at).match(/sha256:\s*([0-9a-f]{64})/)?.[1];
  expect(sha, `${SOURCES} is missing ${fixtureName}'s recorded sha256`).toBeDefined();
  return sha!;
}

const cases = [
  {
    label: "fy94",
    file: "data/RG164.CRIS.FY94.txt",
    fixture: "packages/cris-formatb/fixtures/fy94-9049442.bin",
    fixtureName: "fy94-9049442.bin",
    offset: 6810182,
    length: 10004,
  },
  {
    label: "fy88",
    file: "data/RG310.CRIS.FY88.txt",
    fixture: "packages/cris-formatb/fixtures/fy88-9000001.bin",
    fixtureName: "fy88-9000001.bin",
    offset: 82,
    length: 8200,
  },
];

for (const { label, file, fixture, fixtureName, offset, length } of cases) {
  const exists = existsSync(file);
  const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";

  test.skipIf(skip)(`the committed ${label} fixture is byte-identical to the corpus at its recorded offset`, async () => {
    if (!exists) {
      throw new Error(
        `missing ${file} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const expectedSha = shaFor(fixtureName);

    const fromCorpus = await new FsRangeReader(file).read(offset, length);
    const fixtureBytes = new Uint8Array(readFileSync(fixture));
    expect(fromCorpus).toEqual(fixtureBytes);
    expect(createHash("sha256").update(fromCorpus).digest("hex")).toBe(expectedSha);
  });
}
