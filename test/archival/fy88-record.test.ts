import { existsSync, readFileSync } from "node:fs";
import { scanRecords, parseRecord, fields } from "@barcstory/cris-formatb";

// Unlike fixture-bytes.test.ts, this does not check a fixed byte offset against
// packages/cris-formatb/fixtures/fy88-9000001.bin: that fixture is a synthetic reconstruction
// of AN 9000001's SC field (see fixtures/SOURCES.md), not a corpus slice, because
// RG310.CRIS.FY88.txt was not available on the machine that wrote it. Once the real file is
// present, scanRecords locates AN 9000001 itself, so this test needs no offset recorded up
// front and can be re-pointed at a real fixture slice later without changing.
const FILE = "data/RG310.CRIS.FY88.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";

test.skipIf(skip)("AN 9000001 in the real FY 1988 corpus carries its SC percent from the third separator segment", () => {
  if (!exists) {
    throw new Error(
      `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
    );
  }
  const bytes = new Uint8Array(readFileSync(FILE));
  const { spans } = scanRecords(bytes, 1);
  const span = spans.find(s => s.an === "9000001");
  expect(span, "AN 9000001 not found by scanning the file").toBeDefined();

  const rec = parseRecord(bytes, span!, "RG310.CRIS.FY88.txt", "fy1988", 1);
  const sc = fields(rec, "SC").flatMap(f => f.values);
  expect(sc.map(v => [v.code, v.label, v.percent])).toEqual([
    ["XFRS", "Forestry Related", "100%"],
    ["S0613", "Other Western Conifers", "100%"],
  ]);
  expect(fields(rec, "SN")).toEqual([]);
});
