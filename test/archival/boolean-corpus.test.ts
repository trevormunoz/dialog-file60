import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";

// OR and NOT exercised end to end through RetrievalEngine and DialogSession against the real
// corpus, the same pattern test/archival/session-corpus.test.ts uses for AND. The expected AN
// lists come from fixtures/acceptance-fy94.json's cy_beltsville_or_greenbelt and
// cy_beltsville_not_st_maryland fields, independently derived by scripts/naive-split.py --
// not from this test's own build, which would only prove the session agrees with itself.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "S CY=BELTSVILLE OR CY=GREENBELT and S CY=BELTSVILLE NOT ST=MARYLAND run end to end against the real corpus",
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

    const s1 = (await session.submit("s cy=beltsville or cy=greenbelt")).map(l => l.text);
    expect(s1.at(-1)).toBe(setLine(1, acc.cy_beltsville_or_greenbelt.count, "CY=BELTSVILLE OR CY=GREENBELT"));
    const orAns = session.sets[0]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(orAns).toEqual(acc.cy_beltsville_or_greenbelt.an);

    const s2 = (await session.submit("s cy=beltsville not st=maryland")).map(l => l.text);
    expect(s2.at(-1)).toBe(setLine(2, acc.cy_beltsville_not_st_maryland.count, "CY=BELTSVILLE NOT ST=MARYLAND"));
    const notAns = session.sets[1]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(notAns).toEqual(acc.cy_beltsville_not_st_maryland.an);
  },
  120_000,
);
