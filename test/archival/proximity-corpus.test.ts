import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { FsPositional } from "../../src/retrieval/words-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";
import { PHRASE_FIELDS, type Offsets, type Index } from "../../src/loader/corpus-format";

// S FRESH(W)WATER/TI runs end to end through RetrievalEngine and DialogSession against the real
// corpus and the prebuilt positional shards under public/corpus/pos, the same layout
// FsPositional reads for scripts/cast.ts. The expected count and AN list come from
// fixtures/acceptance-fy94.json's ti_fresh_w_water field, derived independently by
// scripts/naive-split.py's own prox_w (see fixtures/SOURCES.md and fixtures/ACCEPTANCE.md's
// 2026-09-11 run record for the candidate pairs checked before choosing this one) -- not from
// this test's own build, which would only prove the session agrees with itself.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
// A prebuilt public/corpus can carry offsets/index (and even word/) without the positional
// shards FsPositional reads below -- pos/ is the last piece pnpm load writes (docs/indexes.md's
// Positional index section, decision (a)) -- so a partial public/corpus with no public/corpus/pos
// is checked for here, the same "missing prebuilt directory" guard
// test/archival/expand-corpus.test.ts's merged-EXPAND case gives public/corpus/word, and folded
// into the same skip condition `exists` already drives, so CRIS_CORPUS_OPTIONAL=1 skips this
// test cleanly instead of FsPositional's own read() throwing a bare ENOENT mid-test.
const posExists = existsSync("public/corpus/pos/TI");
const optional = process.env.CRIS_CORPUS_OPTIONAL === "1";
const skip = (!exists || !posExists) && optional;
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "S FRESH(W)WATER/TI runs end to end against the real corpus and the prebuilt positional index",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    if (!posExists) {
      throw new Error("missing public/corpus/pos -- run `pnpm load` to build the positional index shards first, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests");
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
    const engine = new RetrievalEngine(
      offsets, indexes, new FsRangeReader(FILE), "fy1991plus", new FsWordIndex("public/corpus"), new FsPositional("public/corpus"),
    );
    const session = new DialogSession(
      engine,
      (rec, format) => (format === "5" ? render5(rec) : [{ text: `? /${format}` }]),
    );

    await session.submit("b 60");

    const s1 = (await session.submit("s fresh(w)water/ti")).map(l => l.text);
    // Four lines: FRESH's own postings, WATER's own postings, the combined proximity line,
    // then the set line -- proto.select.proximity.perterm, the existing perTerm mechanism, no
    // new printing rule.
    expect(s1[0]).toMatch(/^\s+\d+\s+FRESH$/);
    expect(s1[1]).toMatch(/^\s+\d+\s+WATER$/);
    expect(s1[2]).toBe(setLine(null, acc.ti_fresh_w_water.count, "FRESH(W)WATER/TI"));
    expect(s1[3]).toBe(setLine(1, acc.ti_fresh_w_water.count, "FRESH(W)WATER/TI"));

    const ans = session.sets[0]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(ans).toEqual(acc.ti_fresh_w_water.an);
  },
  120_000,
);
