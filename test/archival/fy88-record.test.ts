import { existsSync, readFileSync } from "node:fs";
import { scanRecords, parseRecord, fields } from "@barcstory/cris-formatb";

// Unlike fixture-bytes.test.ts, this does not check a fixed byte offset against
// packages/cris-formatb/fixtures/fy88-9000001.bin (see fixtures/SOURCES.md). It locates
// AN 9000001 by scanning the real file itself, so it needs no offset recorded up front and
// does not change if the corpus is re-extracted or the fixture is re-cut.
const FILE = "data/RG310.CRIS.FY88.txt";
const exists = existsSync(FILE);

if (!exists) {
  console.log(
    `skipping FY 1988 record test: ${FILE} is not present on this machine -- run scripts/extract-corpus.py to produce it`,
  );
}

test.skipIf(!exists)("AN 9000001 in the real FY 1988 corpus carries its SC percent from the third separator segment", () => {
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
