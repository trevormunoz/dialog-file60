import { readFileSync } from "node:fs";
import { scanRecords, parseRecord } from "@barcstory/cris-formatb";
import { render5 } from "../../src/dialog/render5";
import { describeLine, weakest, FY1994_TAPE, NAID, type SourceFile } from "../../src/inspect/panel";
import { registry } from "../../src/registry";

const bytes = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const rec = parseRecord(bytes, scanRecords(bytes, 83052).spans[0]!, "RG164.CRIS.FY94.txt", "fy1991plus");
const SOURCE: SourceFile = { file: "RG164.CRIS.FY94.txt", naid: NAID, profile: "fy1991plus", sha256: "test-sha256" };

test("each displayed value traces to source fields with offsets inside the record span", () => {
  for (const l of render5(rec)) {
    const sources = l.provenance?.sources ?? [];
    const view = describeLine(rec, sources, l.provenance?.registryKeys ?? [], FY1994_TAPE, SOURCE);
    for (const s of view.source) {
      expect(s.offset).toBeGreaterThanOrEqual(rec.offset);
      expect(s.offset).toBeLessThan(rec.offset + rec.length);
      expect(s.line).toBeGreaterThanOrEqual(83052);
    }
    for (const e of view.evidence) expect(() => registry.get(e.key)).not.toThrow();
    if (sources.length === 0 && l.text.trim()) expect(view.evidence.length, l.text).toBeGreaterThan(0); // literals must be documented or labeled
  }
});

test("tape provenance layer is present with the code page unknown", () => {
  const view = describeLine(rec, [{ tag: "DS" }], ["map.DS"], FY1994_TAPE, SOURCE);
  expect(view.tape.asciiConversion.codePage).toBeNull();
  expect(view.tape.logicalRecordLength).toBe(80);
  expect(view.archival.offset).toBe(6810182);
  expect(view.source[0]).toMatchObject({ tag: "DS", raw: "1275", line: 83057, offset: 6810592 });
});

// A composite grid row's provenance selects one value per tag (via
// valueIndex), not every value of every tag the row's seven tags carry.
test("a classification grid row yields exactly seven source values, one per tag", () => {
  const gridLine = render5(rec).find(l => l.provenance?.sources?.some(s => s.valueIndex !== undefined && s.tag === "RP"));
  expect(gridLine, "no grid row found").toBeDefined();
  const view = describeLine(rec, gridLine!.provenance!.sources!, [], FY1994_TAPE, SOURCE);
  expect(view.source).toHaveLength(7);
  expect(new Set(view.source.map(s => s.tag)).size).toBe(7);
  // The DIALOG representation card must select the same one value per tag as
  // the CRIS source card above, not join every value of every tag the row's seven tags carry.
  expect(view.dialog).toHaveLength(7);
  for (const d of view.dialog) expect(d.value).not.toContain(" | ");
});

// weakest(statuses) and the Historical display pill it feeds.
test("weakest returns the least-confident status in STATUS_ORDER, or undefined for no keys", () => {
  expect(weakest(["documented", "inferred", "chosen"])).toBe("chosen");
  expect(weakest(["inferred", "documented"])).toBe("inferred");
  expect(weakest([])).toBeUndefined();
});

test("a tag-less literal line has no historical-display evidence of its own; a tagged line does", () => {
  const literalLine = render5(rec).find(l => l.text.trim() === "" || l.text.includes("The Dialog Corporation"));
  expect(literalLine, "no literal line found").toBeDefined();
  const literalView = describeLine(rec, literalLine!.provenance?.sources ?? [], [], FY1994_TAPE, SOURCE);
  expect(literalView.historicalKeys).toEqual([]);

  const anView = describeLine(rec, [{ tag: "AN" }], [], FY1994_TAPE, SOURCE);
  expect(anView.historicalKeys.length).toBeGreaterThan(0);
  expect(weakest(anView.historicalKeys.map(k => registry.get(k).status))).toBeDefined();
});
