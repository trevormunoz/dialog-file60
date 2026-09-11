import { existsSync, readFileSync } from "node:fs";
import { setLine } from "../../src/dialog/session";
import { buildClipCast, FRICTION_COMMANDS, POULTRY_COMMANDS } from "../../scripts/cast";

// Runs the script's builder in-process (no subprocess is spawned from inside a Vitest test)
// against the real corpus, and checks the built cast's own event text rather than
// re-deriving expectations independently: the poultry numbers come from the settled Task 1
// fixture (fixtures/acceptance-fy94.json), not re-derived here.
const CORPUS_FILE = "data/RG164.CRIS.FY94.txt";
const PUBLIC_OFFSETS = "public/corpus/offsets.json";
const exists = existsSync(CORPUS_FILE) || existsSync(PUBLIC_OFFSETS);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";

const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "friction clip: the unknown suffix errors, the corrected search works",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${CORPUS_FILE} and ${PUBLIC_OFFSETS} -- run scripts/extract-corpus.py and pnpm load, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const { cast } = await buildClipCast(FRICTION_COMMANDS, "…friction…");
    expect(cast).toContain("--- RECONSTRUCTION, NOT A RECORDED SESSION ---");
    expect(cast).toMatch(/poultry\/xx/i); // the rejected command echoes as typed (not uppercased)
    // proto.error.unknown_suffix (registry/evidence.json): no source records DIALOG's text for
    // this case, so the reconstruction prints "?" and the suffix as typed, uppercased with its
    // leading slash (src/retrieval/engine.ts UnknownSuffix, src/dialog/commands/select.ts).
    expect(cast).toContain("? /XX");
    expect(cast).toContain(setLine(1, acc.poultry_ti.count, "POULTRY/TI"));
  },
  120_000,
);

test.skipIf(skip)(
  "poultry clip: set, RANK IN, a record, KWIC, and the PRINT bill",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${CORPUS_FILE} and ${PUBLIC_OFFSETS} -- run scripts/extract-corpus.py and pnpm load, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const { cast } = await buildClipCast(POULTRY_COMMANDS, "…poultry…");
    expect(cast).toContain(setLine(1, acc.poultry_ti.count, "POULTRY/TI"));
    const [topInv, topN] = acc.rank_in_over_poultry[0];
    expect(cast).toContain(topInv); // top ranked investigator appears
    expect(topN).toBeGreaterThan(0);
    expect(cast).toContain(acc.poultry_ti.an[0].replace(/^/, " 0")); // the drilled record's AN, padded as TYPE prints it
    expect(cast).toContain(acc.kwic_9001632_ti_poultry_14); // the KWIC window
    expect(cast).toMatch(/Prints/); // the LOGOFF Prints line
  },
  120_000,
);
