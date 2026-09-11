import { readFileSync } from "node:fs";
import { DialogSession } from "../../src/dialog/session";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";
import { MemoryWordIndex } from "../../src/retrieval/words";

const fixture = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
const reader: RangeReader = { async read(o, l) { return fixture.subarray(o - 6810182, o - 6810182 + l); } };
const offsets = { file: "RG164.CRIS.FY94.txt", sha256: "x", records: [["9049442", 83052, 83173] as [string, number, number]] };
const indexes = { CY: { code: "CY", terms: { BELTSVILLE: [0] } }, IN: { code: "IN", terms: { "HAMMERSCHLAG  F A": [0] } } };
// The injected renderer records the format it receives (seenFormats), and
// mirrors src/app/main.ts's actual handling of a format outside this milestone's slice (only
// "5" is rendered; anything else prints the simulated "? /<format>" form, citing
// proto.error.bad_format), so session.ts's format-passing is asserted against an observable
// response instead of only against parser.ts's AST.
export let seenFormats: string[] = [];
// A fixed clock (never advances) keeps every evidence test's stamp and connect-time line
// reproducible; opts lets a test override it (test/evidence/logoff.test.ts's accounting:
// false case does).
const FIXED_CLOCK = { now: () => new Date(Date.UTC(1994, 4, 3, 10, 0, 0)) };
export const mk = (opts?: { clock?: { now: () => Date }; user?: string; accounting?: boolean }) => {
  seenFormats = [];
  return new DialogSession(
    // An empty MemoryWordIndex, not omitted: a bare truncation (`s oyster?`) reaches the
    // merged Basic Index ("*"), which throws if no word source is configured at all, the
    // same way a bare EXPAND would. Every other evidence test here only ever touches the CY
    // and IN phrase indexes above, so the empty word source changes nothing for them.
    new RetrievalEngine(offsets, indexes, reader, "fy1991plus", new MemoryWordIndex({})),
    (rec, format) => {
      seenFormats.push(format);
      return format === "5"
        ? [{ text: `<record ${rec.an}>` }]
        : [{ text: `? /${format}`, provenance: { registryKeys: ["proto.error.bad_format"] } }];
    },
    { clock: FIXED_CLOCK, accounting: true, ...opts },
  );
};
