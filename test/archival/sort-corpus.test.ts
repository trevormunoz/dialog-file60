import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";
import { PHRASE_FIELDS, type Offsets, type Index } from "../../src/loader/corpus-format";

// S CY=BELTSVILLE then SORT S1/ALL/PN runs end to end through RetrievalEngine and
// DialogSession against the real corpus and the prebuilt phrase indexes, the same layout
// test/archival/truncation-corpus.test.ts already reads. cy_beltsville_sorted_by_pn is the
// only fixture list this task adds that is ORDERED, not sorted for comparison -- it is the AN
// order scripts/naive-split.py derives by sorting the cy_beltsville records on PN (ties on
// AN), and the assertion below reads S2's ordinals back as ANs in that exact order.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "S CY=BELTSVILLE then SORT S1/ALL/PN reorders the set to match the independently-derived PN order",
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
    const s2 = (await session.submit("sort s1/all/pn")).map(l => l.text);
    expect(s2).toEqual([setLine(2, acc.cy_beltsville_sorted_by_pn.count, "Sort S1/ALL/PN")]);

    // The new set's ordinals, read back as ANs in stored order -- not re-sorted here -- must
    // equal the fixture's own ordered list exactly, item by item.
    const ans = session.sets[1]!.ordinals.map(o => offsets.records[o]![0]);
    expect(ans).toEqual(acc.cy_beltsville_sorted_by_pn.an);
  },
  120_000,
);

// SORT S1/ALL/IN exercises the multi-valued tie-break RetrievalEngine.sortKey now applies
// (proto.sort.multivalue_key): 312 of the 669 Beltsville records carry more than one IN value
// (multiple investigators), where PN never does, so this is the one archival case that can
// actually distinguish the fixed rule -- the record's own alphabetically-first IN value --
// from the pre-fix "first write wins in index-insertion order" bug. cy_beltsville_sorted_by_in
// is naive-split.py's independent derivation (min() of each record's own IN values, ties
// broken by AN), not read from src/retrieval/engine.ts.
test.skipIf(skip)(
  "S CY=BELTSVILLE then SORT S1/ALL/IN reorders the set to match the independently-derived, multi-valued IN order",
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
    const s2 = (await session.submit("sort s1/all/in")).map(l => l.text);
    expect(s2).toEqual([setLine(2, acc.cy_beltsville_sorted_by_in.count, "Sort S1/ALL/IN")]);

    const ans = session.sets[1]!.ordinals.map(o => offsets.records[o]![0]);
    expect(ans).toEqual(acc.cy_beltsville_sorted_by_in.an);
  },
  120_000,
);
