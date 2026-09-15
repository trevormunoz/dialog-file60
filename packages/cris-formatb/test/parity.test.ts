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
      expect(JSON.stringify(g)).toBe(JSON.stringify(ts));
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
