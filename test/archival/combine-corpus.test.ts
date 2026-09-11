import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";

// COMBINE exercised end to end through RetrievalEngine and DialogSession against the real
// corpus, the same pattern test/archival/boolean-corpus.test.ts uses for plain SELECT's OR and
// NOT. A set COMBINE builds is not a new kind of arithmetic -- it is the identical expression
// (set OR set, set NOT set) SELECT's own OR/NOT already run, just built from two already-
// numbered sets by COMBINE's own grammar instead of typed out again as one search -- so the
// expected AN lists are the same two fixtures/acceptance-fy94.json fields boolean-corpus.test.ts
// checks against, cy_beltsville_or_greenbelt and cy_beltsville_not_st_maryland, independently
// derived by scripts/naive-split.py from data/RG164.CRIS.FY94.txt (277,539,004 bytes) -- not
// from this test's own build, which would only prove the session agrees with itself. This also
// exercises both forms the 1978 session shows: the range form (COMBINE 1-2/OR) for the OR case,
// the expression form (COMBINE 1 NOT 2) for the NOT case.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "COMBINE 1-2/OR over S CY=BELTSVILLE, S CY=GREENBELT and COMBINE 1 NOT 2 over S CY=BELTSVILLE, S ST=MARYLAND run end to end against the real corpus",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const bytes = new Uint8Array(readFileSync(FILE));
    const { offsets, indexes } = buildIndexes(bytes, "RG164.CRIS.FY94.txt");
    const engine = new RetrievalEngine(offsets, indexes, new FsRangeReader(FILE), "fy1991plus");
    const session = new DialogSession(
      engine,
      (rec, format) => (format === "5" ? render5(rec) : [{ text: `? /${format}` }]),
    );

    await session.submit("b 60");
    await session.submit("s cy=beltsville"); // S1
    await session.submit("s cy=greenbelt"); // S2

    const orOut = (await session.submit("combine 1-2/or")).map(l => l.text);
    expect(orOut).toEqual([setLine(3, acc.cy_beltsville_or_greenbelt.count, "1-2/OR")]);
    const orAns = session.sets[2]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(orAns).toEqual(acc.cy_beltsville_or_greenbelt.an);

    await session.submit("s st=maryland"); // S4

    const notOut = (await session.submit("combine 1 not 4")).map(l => l.text);
    expect(notOut).toEqual([setLine(5, acc.cy_beltsville_not_st_maryland.count, "1 NOT 4")]);
    const notAns = session.sets[4]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(notAns).toEqual(acc.cy_beltsville_not_st_maryland.an);
  },
  120_000,
);
