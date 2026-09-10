import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";

// EXPAND and PAGE exercised end to end against the real IN index, the same pattern
// test/archival/boolean-corpus.test.ts uses for OR and NOT.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "e in=hammerschlag: twelve rows, the entered term third, item counts matching the loaded IN index; p, p- and select against the real corpus",
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

    const first = (await session.submit("e in=hammerschlag")).map(l => l.text);
    const opened = session.expand;
    expect(opened).not.toBeNull();
    expect(opened!.rows).toHaveLength(12);
    expect(first[0]).toBe("Ref   Items  Index-term");
    expect(opened!.rows.filter(r => r.starred)).toHaveLength(1);
    expect(opened!.rows[2]!.starred).toBe(true);

    // The entered term "HAMMERSCHLAG" (the query, uppercased) is not itself a posting in the
    // IN index -- the real index term nearest it is "HAMMERSCHLAG  F A". The starred row's
    // zero-item count is the entered term's own absence, not a bug, so it is asserted
    // explicitly here rather than folded into the per-row check below, where a missing index
    // entry would otherwise read as a passing zero.
    expect(opened!.rows[2]!.term).toBe("HAMMERSCHLAG");
    expect(indexes.IN!.terms["HAMMERSCHLAG"]).toBeUndefined();
    expect(opened!.rows[2]!.items).toBe(0);
    for (const row of opened!.rows) {
      if (row.starred) continue;
      expect(row.items).toBe(indexes.IN!.terms[row.term]!.length);
    }

    await session.submit("p");
    const paged = session.expand!;
    expect(paged.rows.map(r => r.ref)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(paged.rows.every(r => !r.starred)).toBe(true);

    await session.submit("p-");
    const back = session.expand!;
    expect(back.rows.map(r => r.ref)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(back.rows.every(r => !r.starred)).toBe(true);
    expect(back.rows.map(r => r.term)).toEqual(opened!.rows.map(r => r.term));

    // Select the row with a real posting -- "HAMMERSCHLAG  F A" -- rather than the starred,
    // absent entered term: selecting the absent term would carry a zero postings count that
    // any broken set-building code would also produce, so it would not exercise real
    // retrieval. The expected count comes from fixtures/acceptance-fy94.json's
    // in_hammerschlag_f_a, an independently derived number (scripts/naive-split.py), not from
    // this test's own row.items, which the session under test built itself.
    const target = back.rows.find(r => r.term === "HAMMERSCHLAG  F A")!;
    const setLines = (await session.submit(`s e${target.ref}`)).map(l => l.text);
    expect(target.items).toBe(acc.in_hammerschlag_f_a.count);
    expect(setLines.at(-1)).toBe(setLine(1, acc.in_hammerschlag_f_a.count, `E${target.ref}`));
    expect(session.sets[0]!.ordinals.length).toBe(acc.in_hammerschlag_f_a.count);
  },
  120_000,
);

// A bare EXPAND (no prefix) browses the merged Basic Index, unioning the /TX, /TI, /DE and
// /PB word indexes per term rather than approximating with a per-code maximum. This runs the
// merge against the real corpus and the prebuilt word-index shards under public/corpus/word
// (built by `pnpm load`), the same layout test/archival/word-corpus.test.ts reads. Measured
// 2026-09-10: the merged EXPAND itself (past the corpus and index build already timed by the
// test above) took 853ms, once, for the whole merged term list; the twelve rows shown to the
// session are then free, since termList() caches the merged list per engine instance.
test.skipIf(skip)(
  "e peach: a merged Basic Index row's Items count equals what SELECT then retrieves for its E-number",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    if (!existsSync("public/corpus/word/TX/terms.json")) {
      throw new Error("missing public/corpus/word -- run `pnpm load` to build the word-index shards first");
    }
    const bytes = new Uint8Array(readFileSync(FILE));
    const { offsets, indexes } = buildIndexes(bytes, "RG164.CRIS.FY94.txt");
    const engine = new RetrievalEngine(
      offsets, indexes, new FsRangeReader(FILE), "fy1991plus", new FsWordIndex("public/corpus"),
    );
    const session = new DialogSession(
      engine,
      (rec, format) => (format === "5" ? render5(rec) : [{ text: `? /${format}` }]),
    );
    await session.submit("b 60");
    await session.submit("e peach");

    const opened = session.expand!;
    expect(opened.rows).toHaveLength(12);
    const target = opened.rows[0]!;
    const setLines = (await session.submit(`s e${target.ref}`)).map(l => l.text);
    expect(setLines.at(-1)).toBe(setLine(1, target.items, `E${target.ref}`));
    expect(session.sets[0]!.ordinals.length).toBe(target.items);
  },
  120_000,
);
