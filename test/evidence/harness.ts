import { readFileSync } from "node:fs";
import { DialogSession } from "../../src/dialog/session";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";

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
export const mk = () => {
  seenFormats = [];
  return new DialogSession(new RetrievalEngine(offsets, indexes, reader, "fy1991plus"), (rec, format) => {
    seenFormats.push(format);
    return format === "5"
      ? [{ text: `<record ${rec.an}>` }]
      : [{ text: `? /${format}`, provenance: { registryKeys: ["proto.error.bad_format"] } }];
  });
};
