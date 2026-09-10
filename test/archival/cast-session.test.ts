import { existsSync } from "node:fs";
import { setLine } from "../../src/dialog/session";
import { buildFirstSessionCast } from "../../scripts/cast";

// Runs the script's builder in-process (no subprocess is spawned from inside a Vitest test)
// against the real corpus, and checks
// the built cast's own event text rather than re-deriving expectations independently: the
// acceptance session (fixtures/ACCEPTANCE.md) is already exercised end to end against the
// real corpus by test/archival/session-corpus.test.ts, so this test's job is only to confirm
// the cast carries that same session's output, not to re-prove the retrieval itself.
const CORPUS_FILE = "data/RG164.CRIS.FY94.txt";
const PUBLIC_OFFSETS = "public/corpus/offsets.json";
const exists = existsSync(CORPUS_FILE) || existsSync(PUBLIC_OFFSETS);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";

test.skipIf(skip)(
  "the built cast's events carry the SS/S OR set lines, DISPLAY SETS, and the AN 9049442 line",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${CORPUS_FILE} and ${PUBLIC_OFFSETS} -- run scripts/extract-corpus.py and pnpm load, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const { cast } = await buildFirstSessionCast();
    const [headerLine, ...eventLines] = cast.trim().split("\n");
    expect(headerLine).toBeTruthy();
    const joined = eventLines.map((l) => (JSON.parse(l) as [number, "o", string])[2]).join("");

    // Acceptance numbers (settled, fixtures/acceptance-fy94.json): SS CY=BELTSVILLE OR
    // CY=GREENBELT gives S1 669, S2 0 (no record in this corpus carries CY=GREENBELT), S3 the
    // union 669; S S3 AND IN=HAMMERSCHLAG F A gives S4, 2 records.
    expect(joined).toContain(setLine(1, 669, "CY=BELTSVILLE"));
    expect(joined).toContain(setLine(2, 0, "CY=GREENBELT"));
    expect(joined).toContain(setLine(3, 669, "CY=BELTSVILLE OR CY=GREENBELT"));
    expect(joined).toContain(setLine(null, 2, "IN=HAMMERSCHLAG  F A"));
    expect(joined).toContain(setLine(4, 2, "S3 AND IN=HAMMERSCHLAG  F A"));
    expect(joined).toContain(" 09049442");

    // LOGOFF: one format-5 type, and a connect time fixed by the cast clock. The clock calls
    // now() exactly three times regardless of how many search commands run between them
    // (session construction, BEGIN's stamp, LOGOFF's end -- src/dialog/session.ts only reads
    // the clock in those two branches), so the 24-second span between BEGIN and LOGOFF, and the
    // 0.007 Hrs it prints, hold for this longer session the same way they held for the
    // four-command acceptance session.
    expect(joined).toContain("1 Types in Format 5");
    expect(joined).toContain("0.007 Hrs File60");
  },
  120_000,
);
