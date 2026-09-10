import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FsRangeReader } from "../../src/retrieval/reader-node";

// Both test/archival/render5-9049442.test.ts and provenance.test.ts read
// only the committed fixture, never the corpus it claims to be. This test reads the corpus at
// the fixture's recorded offset and asserts byte equality, so a stale or hand-edited fixture
// is caught. The expected sha256 is read from packages/cris-formatb/fixtures/SOURCES.md
// rather than duplicated here as a second literal.
const FILE = "data/RG164.CRIS.FY94.txt";
const FIXTURE = "packages/cris-formatb/fixtures/fy94-9049442.bin";
const SOURCES = "packages/cris-formatb/fixtures/SOURCES.md";
const OFFSET = 6810182;
const LENGTH = 10004;
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";

test.skipIf(skip)("the committed fixture is byte-identical to the corpus at its recorded offset", async () => {
  if (!exists) {
    throw new Error(
      `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
    );
  }
  const sourcesText = readFileSync(SOURCES, "utf8");
  const expectedSha = sourcesText.match(/sha256:\s*([0-9a-f]{64})/)?.[1];
  expect(expectedSha, `${SOURCES} is missing the fixture's recorded sha256`).toBeDefined();

  const fromCorpus = await new FsRangeReader(FILE).read(OFFSET, LENGTH);
  const fixture = new Uint8Array(readFileSync(FIXTURE));
  expect(fromCorpus).toEqual(fixture);
  expect(createHash("sha256").update(fromCorpus).digest("hex")).toBe(expectedSha);
});
