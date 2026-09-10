import { readFileSync } from "node:fs";
import { scanRecords, parseRecord } from "@barcstory/cris-formatb";
import { render5 } from "../../src/dialog/render5";

const bytes = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const rec = parseRecord(bytes, scanRecords(bytes, 83052).spans[0]!, "RG164.CRIS.FY94.txt", "fy1991plus");
const out = render5(rec);
const text = out.map(l => l.text);

// fixtures/fy94-9049442.format5.txt is generated from this renderer's own current output for
// the real archival record, checked line by line against fixtures/bluesheet-sample-1998.txt
// and fixtures/SOURCES.md's measurements of it (see the fixture's own header comment for the
// full method and the reasons behind each marked line). Comparing against the whole fixture,
// rather than spot-checking a handful of lines, covers the headings blocks and the reflowed
// text narrative too.
const fixtureText = readFileSync("fixtures/fy94-9049442.format5.txt", "utf8");
const rawLines = fixtureText.endsWith("\n") ? fixtureText.slice(0, -1).split("\n") : fixtureText.split("\n");
const regressionOnly = [...fixtureText.matchAll(/^# regression-only: "((?:[^"\\]|\\.)*)"/gm)]
  .map(m => m[1]!.replace(/\\"/g, '"'));

// Walk the fixture in file order, substituting each "# regression-only:" marker's quoted
// line back in place, to get the full expected render as the file lays it out -- not just
// an in-order subsequence, so a rendered line moving position would fail this test too.
const expected: string[] = [];
for (const line of rawLines) {
  const m = line.match(/^# regression-only: "((?:[^"\\]|\\.)*)"/);
  if (m) { expected.push(m[1]!.replace(/\\"/g, '"')); continue; }
  if (line.startsWith("#")) continue;
  expected.push(line);
}

test("the full render equals the fixture's non-comment lines in order", () => {
  expect(text).toEqual(expected);
});

test("regression-only lines (no validated precedent in the Blue Sheet sample) are still pinned", () => {
  // 1 PT line + 5 PRIMARY HEADINGS + 2 GENERAL HEADINGS + 3 textBlock label rows (OB/AP/DE).
  expect(regressionOnly, "the fixture's set of '# regression-only:' markers changed -- update this count").toHaveLength(11);
  for (const line of regressionOnly) expect(text, `regression-only line missing: ${JSON.stringify(line)}`).toContain(line);
});

test("every rendered line carries provenance to source tags, or is a documented literal", () => {
  for (const l of out) {
    if (l.text.trim() === "") continue;
    const p = l.provenance;
    expect(p, l.text).toBeDefined();
    expect((p!.sources?.length ?? 0) > 0 || (p!.registryKeys?.length ?? 0) > 0, l.text).toBe(true);
  }
});
