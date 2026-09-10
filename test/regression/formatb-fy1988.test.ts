import { readFileSync } from "node:fs";
import { scanRecords, parseRecord, fields } from "@barcstory/cris-formatb";

// The real RG310.CRIS.FY88.txt is not present on this machine; this fixture is a synthetic
// reconstruction of AN 9000001's SC field from the byte-level transcription in the plan
// (spec section 6.1), not a slice cut from the corpus with dd. See fixtures/SOURCES.md.
const bytes = new Uint8Array(readFileSync(new URL("../../packages/cris-formatb/fixtures/fy88-9000001.bin", import.meta.url)));
const { spans: [span] } = scanRecords(bytes, 1);

test("under fy1988 an SC value carries its percent from the third separator segment", () => {
  const rec = parseRecord(bytes, span!, "RG310.CRIS.FY88.txt", "fy1988");
  const sc = fields(rec, "SC").flatMap(f => f.values);
  expect(sc.map(v => [v.code, v.label, v.percent])).toEqual([
    ["XFRS", "Forestry Related", "100%"],
    ["S0613", "Other Western Conifers", "100%"],
  ]);
  expect(sc[1]!.continuation).toBe(true);
  expect(fields(rec, "SN")).toEqual([]); // FY 1988 has no SN lines (spec 6.1)
});

test("under fy1991plus the same bytes keep the two-segment split, so the profile is observable", () => {
  const rec = parseRecord(bytes, span!, "RG310.CRIS.FY88.txt", "fy1991plus");
  const sc = fields(rec, "SC").flatMap(f => f.values);
  expect(sc[0]!.percent).toBeUndefined();
  expect(sc[0]!.label).toContain("100%"); // the percent is still inside the label
});
