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
  "the built cast's events carry the S1/S2 set lines and the AN 9049442 line",
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

    // Acceptance numbers (settled): S1 CY=BELTSVILLE 669; S2 the AND set, 2 records.
    expect(joined).toContain(setLine(1, 669, "CY=BELTSVILLE"));
    expect(joined).toContain(setLine(2, 2, "S1 AND IN=HAMMERSCHLAG  F A"));
    expect(joined).toContain(" 09049442");
  },
  120_000,
);
