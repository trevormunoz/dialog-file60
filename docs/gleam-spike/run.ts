// Harness: run the Gleam-backed facade and the real TS scanRecords/parseRecord
// over the same inputs, assert byte-for-byte-equal JSON output.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scanRecords as facadeScan, parseRecord as facadeParse } from "./facade.ts";
import {
  scanRecords as oracleScan,
  parseRecord as oracleParse,
  type Profile,
} from "../../packages/cris-formatb/src/index.ts";

const FIX = fileURLToPath(new URL("../../packages/cris-formatb/fixtures", import.meta.url));
const SEP_A = 0xa0;
const SEP_B = 0x02;
const CONT = 0xac;

// Build an 82-byte line from parts: strings -> char codes, numbers -> raw bytes.
function line(...parts: Array<string | number>): number[] {
  const content: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (let i = 0; i < p.length; i++) content.push(p.charCodeAt(i));
    else content.push(p);
  }
  const b = new Array(82).fill(0x20);
  for (let i = 0; i < Math.min(content.length, 80); i++) b[i] = content[i]!;
  b[80] = 0x0d;
  b[81] = 0x0a;
  return b;
}
// tag (cols 1-2) + pad at col 3 (index 2) + data from index 3 (DATA_START).
const fld = (tag: string, ...data: Array<string | number>) => line(tag, " ", ...data);

const synthetic = new Uint8Array([
  ...line("<< FILE HEADER"),
  // record one: separators, a 0xAC continuation (new value), a plain
  // continuation (raw concat).
  ...line("$$ rec one"),
  ...fld("AN", "9000001"),
  // CODE1 is followed by an NBSP (0xA0) then a space before the separator, so
  // the code segment ends in NBSP at the trim edge — the exact case where JS
  // .trimEnd() (strips NBSP) and Gleam string.trim_end (does not) diverge.
  ...fld("SC", "CODE1", SEP_A, " ", SEP_A, SEP_B, "LABEL ONE", SEP_A, SEP_B, "75"),
  ...fld("  ", CONT, "SECOND VALUE", SEP_A, SEP_B, "LBL2"),
  ...fld("  ", "APPENDED-TO-SECOND"),
  // record two: an orphan continuation (blank tag before any field), then a
  // field with no separators (code/label stay absent).
  ...line("$$ rec two"),
  ...fld("  ", "orphan line, no open field"),
  ...fld("AN", "9049442"),
  ...fld("TI", "SOME TITLE"),
  ...line(">> FILE TRAILER"),
]);

type Case = { name: string; bytes: Uint8Array; baseLine: number; profile: Profile; file: string };
const cases: Case[] = [
  { name: "synthetic @ fy1988 (percent-in-block)", bytes: synthetic, baseLine: 1, profile: "fy1988", file: "synthetic" },
  { name: "synthetic @ fy1991plus", bytes: synthetic, baseLine: 1, profile: "fy1991plus", file: "synthetic" },
  { name: "fy88-9000001.bin @ fy1988", bytes: new Uint8Array(readFileSync(`${FIX}/fy88-9000001.bin`)), baseLine: 1, profile: "fy1988", file: "fy88-9000001.bin" },
  { name: "fy94-9049442.bin @ fy1991plus", bytes: new Uint8Array(readFileSync(`${FIX}/fy94-9049442.bin`)), baseLine: 1, profile: "fy1991plus", file: "fy94-9049442.bin" },
];

let pass = 0;
let fail = 0;
const check = (label: string, want: string, got: string) => {
  if (want === got) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
    console.log("  --- oracle (TS) ---\n" + want.split("\n").map((l) => "    " + l).join("\n"));
    console.log("  --- facade (Gleam) ---\n" + got.split("\n").map((l) => "    " + l).join("\n"));
  }
};

for (const c of cases) {
  // scanRecords parity
  check(
    `scan  ${c.name}`,
    JSON.stringify(oracleScan(c.bytes, c.baseLine), null, 1),
    JSON.stringify(facadeScan(c.bytes, c.baseLine), null, 1),
  );
  // parseRecord parity, per span
  const spans = oracleScan(c.bytes, c.baseLine).spans;
  spans.forEach((span, i) => {
    check(
      `parse ${c.name} [span ${i}: an=${span.an || "?"}]`,
      JSON.stringify(oracleParse(c.bytes, span, c.file, c.profile, c.baseLine), null, 1),
      JSON.stringify(facadeParse(c.bytes, span, c.file, c.profile, c.baseLine), null, 1),
    );
  });
}

// Malformed-length parity: offsets.ts throws on a non-82-multiple buffer; the
// facade must throw the same way.
const thrown = (fn: () => unknown): string => {
  try {
    fn();
    return "(did not throw)";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const bad = new Uint8Array(100);
check(
  "throw on non-82-multiple buffer (length 100)",
  thrown(() => oracleScan(bad, 1)),
  thrown(() => facadeScan(bad, 1)),
);

// parseRecord: a span that falls outside the buffer throws (record.ts:44-50).
const outOfRange = { firstLine: 10000, lastLine: 10000, offset: (10000 - 1) * 82, length: 82, an: "ZZ" };
check(
  "throw on span outside buffer",
  thrown(() => oracleParse(synthetic, outOfRange, "synthetic", "fy1991plus", 1)),
  thrown(() => facadeParse(synthetic, outOfRange, "synthetic", "fy1991plus", 1)),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
