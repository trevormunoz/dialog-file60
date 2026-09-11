import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { DialogSession } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";
import { rankTally } from "../../src/dialog/rank";
import { PHRASE_FIELDS, type Offsets, type Index } from "../../src/loader/corpus-format";

// S CY=BELTSVILLE then RANK ST runs end to end through RetrievalEngine.rankValues and
// DialogSession against the real corpus and the prebuilt phrase indexes, the same layout
// test/archival/sort-corpus.test.ts already reads. rank_st_over_cy_beltsville
// (fixtures/acceptance-fy94.json) is scripts/naive-split.py's independent per-set tally of ST
// over the cy_beltsville set -- Trevor's accepted decision (c) -- checked against
// RetrievalEngine.rankValues's own tally here, not against the printed block's column layout
// (proto.rank.columns is this reconstruction's own choice, not evidence).
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "S CY=BELTSVILLE then RANK ST matches the independently-derived per-set tally",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    let offsets: Offsets;
    let indexes: Record<string, Index>;
    if (existsSync("public/corpus/offsets.json")) {
      offsets = JSON.parse(readFileSync("public/corpus/offsets.json", "utf8"));
      indexes = {};
      for (const code of PHRASE_FIELDS) indexes[code] = JSON.parse(readFileSync(`public/corpus/index/${code}.json`, "utf8"));
    } else {
      const bytes = new Uint8Array(readFileSync(FILE));
      const built = buildIndexes(bytes, "RG164.CRIS.FY94.txt");
      offsets = built.offsets;
      indexes = built.indexes;
    }
    const engine = new RetrievalEngine(offsets, indexes, new FsRangeReader(FILE), "fy1991plus", new FsWordIndex("public/corpus"));
    const session = new DialogSession(
      engine,
      (rec, format) => (format === "5" ? render5(rec) : [{ text: `? /${format}` }]),
    );

    await session.submit("b 60");
    await session.submit("s cy=beltsville");
    expect(session.sets[0]!.ordinals.length).toBe(acc.cy_beltsville.count);

    const counts = engine.rankValues("ST", session.sets[0]!.ordinals);
    const rows = rankTally(counts);
    const derived: [string, number][] = acc.rank_st_over_cy_beltsville;
    expect(rows.map(r => [r.term, r.items])).toEqual(derived);
  },
  120_000,
);
