// The strict byte-parity gate (design spec §5.1): for every record the
// Gleam facade reads, JSON.stringify(gleam) === JSON.stringify(ts oracle)
// for both scanRecords and parseRecord, over both profiles. The oracle
// (src-ts/record.ts + src-ts/offsets.ts) always wins a mismatch — see the
// module docs on src/facade.gleam for what's been ported to match it.
//
// Fixtures (committed, always run) prove the wiring on a clean checkout.
// The full corpus (data/*.txt, gitignored) is the real gate per the design
// spec — "not a sample". It is OPT-IN, not part of the default suite: each
// file is ~250MB / tens of thousands of records and a single test runs ~3
// minutes, long enough to trip vitest's worker<->main heartbeat. Run it
// explicitly with `CRIS_PARITY_CORPUS=1 pnpm exec vitest run
// packages/cris-formatb/test/parity.test.ts`. Validated GREEN over all three
// corpora (FY88/FY89/FY94, both profiles, every record) on 2026-09-15
// (~9.2 min total); re-run on any change to the facade/segment/wrapper.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { scanRecords as tsScan } from "../src-ts/offsets";
import { parseRecord as tsParse } from "../src-ts/record";
import { scanRecords as gScan, parseRecord as gParse } from "../src-ts/wrapper";
import type { RecordSpan } from "../src-ts/offsets";
import type { Profile } from "../src-ts/profiles";

// Both profiles are asserted against every file, not just the one the file
// "naturally" is: split_heading_segments's percent_in_block gating is what's
// under test, and a clean corpus mostly masks it (FY1991+ carries percent in
// a separate SN tag, so its own profile never exercises the second split) —
// the design spec calls this out by name as a risk the harness must still
// assert, not assume.
const PROFILES: readonly Profile[] = ["fy1988", "fy1991plus"];

// The full-corpus sweep is opt-in (see header): heavy and slow, so it never
// runs in the default `vitest run` / app-suite gate. Fixtures always run.
const RUN_CORPUS = process.env.CRIS_PARITY_CORPUS === "1";

function readBytes(url: URL): Uint8Array {
  return new Uint8Array(readFileSync(url));
}

// mirrors field_cardinality.gleam (source of truth); test-only copy.
const SINGLE_VALUE_TAGS = new Set([
  "AN","PN","TI","PS","PT","AS","DS","IC","PI","CY","ST","ZP","RE","CG","RG",
  "RN","OC","PD","SD","SX","TD","TX","FY","GY","UP","PP","PX","BT","AT","DT",
  "OB","AP","DE","PR","PB",
]);

// Field-level parity-except-sourced-corrections (design spec gates 1-2). Multi/
// unsourced tags must match the frozen oracle exactly. A single-value tag either
// matches exactly (no 0xAC) or diverges in EXACTLY the corrected shape: oracle
// split >=2, facade joined to 1, continuation false, opener line/offset kept,
// 0xAC recovered as data. Any other difference fails.
function assertFieldLevelParity(g: any, ts: any): void {
  // Every record-level field the whole-record JSON.stringify used to cover, so
  // this comparator is not weaker than what it replaces (record.ts:7-12).
  expect(g.file).toBe(ts.file);
  expect(g.an).toBe(ts.an);
  expect(g.firstLine).toBe(ts.firstLine);
  expect(g.lastLine).toBe(ts.lastLine);
  expect(g.offset).toBe(ts.offset);
  expect(g.length).toBe(ts.length);
  expect(g.orphanContinuations).toBe(ts.orphanContinuations);
  expect(g.fields.length).toBe(ts.fields.length);
  for (let i = 0; i < ts.fields.length; i++) {
    const gf = g.fields[i], tf = ts.fields[i];
    expect(gf.tag).toBe(tf.tag);
    if (!SINGLE_VALUE_TAGS.has(tf.tag)) {
      expect(JSON.stringify(gf)).toBe(JSON.stringify(tf)); // gate 1
      continue;
    }
    if (JSON.stringify(gf) === JSON.stringify(tf)) continue; // single-value, no 0xAC
    // gate 2 — shaped differential
    expect(tf.values.length).toBeGreaterThanOrEqual(2);
    expect(gf.values.length).toBe(1);
    expect(gf.lineStart).toBe(tf.lineStart);
    expect(gf.lineEnd).toBe(tf.lineEnd);
    expect(gf.offset).toBe(tf.offset);
    expect(gf.length).toBe(tf.length);
    const only = gf.values[0];
    // SourceValue.continuation is `continuation?: true` (record.ts:5): present
    // only when true, ABSENT otherwise (never the literal false). The merged
    // value is opened by the tagged start, so it must be falsy/absent here.
    expect(only.continuation).toBeFalsy();
    expect(only.line).toBe(tf.values[0].line);
    expect(only.offset).toBe(tf.values[0].offset);
    expect(only.raw.includes("¬")).toBe(true);
  }
}

function assertScanParity(bytes: Uint8Array): { spans: RecordSpan[] } {
  const ts = tsScan(bytes);
  const g = gScan(bytes);
  expect(JSON.stringify(g)).toBe(JSON.stringify(ts));
  return ts;
}

// A tight synchronous loop over tens of thousands of records (the full
// corpus) blocks the event loop long enough that vitest's own worker<->main
// heartbeat ("onTaskUpdate") times out and reports a spurious unhandled
// error, even though every assertion inside has already passed — so this
// yields back to the event loop periodically. Purely a test-harness
// concern; it changes nothing about what gets compared or how.
async function assertParseParity(
  bytes: Uint8Array,
  spans: RecordSpan[],
  file: string,
): Promise<void> {
  const yieldEvery = 500;
  let n = 0;
  for (const profile of PROFILES) {
    for (const span of spans) {
      const ts = tsParse(bytes, span, file, profile, 1);
      const g = gParse(bytes, span, file, profile, 1);
      assertFieldLevelParity(g, ts);
      n++;
      if (n % yieldEvery === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }
}

describe("strict byte-parity: Gleam facade == TS oracle (committed fixtures)", () => {
  const fixtures = ["fy88-9000001.bin", "fy94-9049442.bin"];

  for (const name of fixtures) {
    const url = new URL(`../fixtures/${name}`, import.meta.url);

    it(`scanRecords parity: ${name}`, () => {
      assertScanParity(readBytes(url));
    });

    it(`parseRecord parity (both profiles): ${name}`, async () => {
      const bytes = readBytes(url);
      const { spans } = tsScan(bytes);
      await assertParseParity(bytes, spans, name);
    });
  }
});

// 82-byte line: tag cols 1-2, pad col 3, data from col 4; CRLF at 80-81.
function line(...parts: Array<string | number>): number[] {
  const content: number[] = [];
  for (const p of parts)
    if (typeof p === "string") for (let i = 0; i < p.length; i++) content.push(p.charCodeAt(i));
    else content.push(p);
  const b = new Array(82).fill(0x20);
  for (let i = 0; i < Math.min(content.length, 80); i++) b[i] = content[i]!;
  b[80] = 0x0d; b[81] = 0x0a; return b;
}
const fld = (tag: string, ...d: Array<string | number>) => line(tag, " ", ...d);

it("gate 3: oracle splits a single-value 0xAC field; facade joins it", () => {
  const bytes = new Uint8Array([
    ...line("<< H"), ...line("$$"), ...fld("AN", "9000001"),
    ...fld("OB", "First part"),
    ...fld("  ", 0xac, "quoted tail"), // 0xac is the first DATA byte -> marker
    ...line(">> T"),
  ]);
  const { spans } = tsScan(bytes);
  const span = spans[0]!;
  const ts = tsParse(bytes, span, "synthetic", "fy1991plus", 1);
  const g = gParse(bytes, span, "synthetic", "fy1991plus", 1);
  const tf = ts.fields.find((f: any) => f.tag === "OB")!;
  const gf = g.fields.find((f: any) => f.tag === "OB")!;
  expect(tf.values.length).toBeGreaterThanOrEqual(2); // old reading splits
  expect(gf.values.length).toBe(1);                   // corrected reading joins
  const only = gf.values[0]!;
  expect(only.raw.includes("¬")).toBe(true);
  expect(only.continuation).toBeFalsy();
});

describe.runIf(RUN_CORPUS)("strict byte-parity: Gleam facade == TS oracle (full corpus)", () => {
  // Opt-in (CRIS_PARITY_CORPUS=1) AND data/ present. When both hold, this is
  // the real gate: every record, both profiles, not a sample.
  const corpus = [
    "RG310.CRIS.FY88.txt",
    "RG164.CRIS.FY89.txt",
    "RG164.CRIS.FY94.txt",
  ];

  for (const name of corpus) {
    const url = new URL(`../../../data/${name}`, import.meta.url);

    it.runIf(existsSync(url))(
      `scanRecords + parseRecord parity over every record (both profiles): ${name}`,
      async () => {
        const bytes = readBytes(url);
        const { spans } = assertScanParity(bytes);
        await assertParseParity(bytes, spans, name);
      },
      30 * 60_000,
    );
  }
});
