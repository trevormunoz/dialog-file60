import { readFileSync } from "node:fs";
import { DialogSession } from "../../src/dialog/session";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";
import { MemoryWordIndex } from "../../src/retrieval/words";

// A real record: the same AN 9049442 slice test/evidence/harness.ts and
// test/archival/render5-9049442.test.ts use (RG164.CRIS.FY94.txt, lines 83052-83173). Its TI
// field reads "GENE TRANSFER AND TISSUE CULTURE TECHNOLOGIES FOR IMPROVEMENT OF PEACH,
// SOYBEAN, AND TOBACCO" -- 13 words, one PEACH (fixtures/fy94-9049442.format5.txt). The word
// index below is hand-built for just that one term, the same way test/evidence/harness.ts
// hand-builds phrase indexes for just CY and IN -- not the prebuilt corpus shards, but the
// same postings a real /TI build would produce for this one record and this one term.
const fixture = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const reader: RangeReader = { async read(o, l) { return fixture.subarray(o - 6810182, o - 6810182 + l); } };
const offsets = { file: "RG164.CRIS.FY94.txt", sha256: "x", records: [["9049442", 83052, 83173] as [string, number, number]] };
const wordIndex = new MemoryWordIndex({ "/TI": { code: "/TI", shards: { P: { PEACH: [0] } }, terms: [["PEACH", 1]] } });

const mk = () =>
  new DialogSession(
    new RetrievalEngine(offsets, {}, reader, "fy1991plus", wordIndex),
    (_rec, format) => [{ text: format === "5" ? "<record>" : `? /${format}` }],
    { clock: { now: () => new Date(Date.UTC(1994, 4, 3, 10, 0, 0)) } },
  );

test("SET KWIC nn prints the 2001 manual's own acknowledgement", async () => {
  const s = mk();
  await s.submit("b 60");
  expect((await s.submit("set kwic 14")).map(l => l.text)).toEqual(["KWIC is set to 14."]);
});

test("SET KWIC outside 2..50 is the simulated typo error, not a window change", async () => {
  const s = mk();
  await s.submit("b 60");
  // offendingToken(shared.ts) has no special case for SET; an unparseable "SET ..." falls to
  // its generic default, the first word of the line -- the same fallback an unrecognized "ZX
  // ..." command gets (test/evidence/session.test.ts).
  expect((await s.submit("set kwic 1")).map(l => l.text)).toEqual(["? SET"]);
  expect((await s.submit("set kwic 51")).map(l => l.text)).toEqual(["? SET"]);
});

test("T Sn/K/i prints the item header, then at least one window over the real record holding the search term", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s peach/ti"); // S1
  await s.submit("s peach/ti"); // S2 -- the brief's own worked form, T S2/K/1
  await s.submit("set kwic 14");
  const out = (await s.submit("t s2/k/1")).map(l => l.text);
  expect(out[0]).toBe("");
  expect(out[1]).toBe("2/K/1");
  const windows = out.slice(2);
  expect(windows.length).toBeGreaterThan(0);
  expect(windows.some(w => w.includes("PEACH"))).toBe(true);
  // The TI field is 13 words; a 14-word window is not cut on either side, so the whole title
  // is one window with no ellipsis -- derived independently in scripts/naive-split.py
  // (kwic_9049442_ti_peach_14 in fixtures/acceptance-fy94.json), not from kwic.ts itself.
  const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));
  expect(windows).toContain(acc.kwic_9049442_ti_peach_14);
});

test("LOGOFF resets the KWIC window back to the 30-word default", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("set kwic 14");
  await s.submit("logoff");
  await s.submit("b 60");
  await s.submit("s peach/ti");
  await s.submit("s peach/ti");
  // At the default 30-word width the whole 13-word title is still one unellipsised window;
  // the point of this test is that kwicSize itself reset, not the window's shape.
  const out = (await s.submit("t s2/k/1")).map(l => l.text);
  expect(out.slice(2).some(w => w.includes("PEACH") && !w.includes("..."))).toBe(true);
});
