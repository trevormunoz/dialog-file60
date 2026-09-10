import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";
import { PHRASE_FIELDS, type Offsets, type Index } from "../../src/loader/corpus-format";

// S PEACH/TI run end to end through RetrievalEngine and DialogSession against the real
// corpus and the prebuilt word-index shards under public/corpus/word, the same layout
// FsWordIndex reads for scripts/cast.ts. The expected count and AN list come from
// fixtures/acceptance-fy94.json's ti_peach field, derived independently by
// scripts/naive-split.py's own tokenizer (see test/archival/naive-rederive.test.ts) -- not
// from this test's own build, which would only prove the session agrees with itself.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "S PEACH/TI runs end to end against the real corpus and the prebuilt word index",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    let offsets: Offsets;
    let indexes: Record<string, Index>;
    // Prefer the already-built public/corpus files if present, the same preference
    // scripts/cast.ts's loadEngine uses, so this test and `pnpm cast` read the phrase side
    // of the corpus the same way. Either way public/corpus/word (FsWordIndex's root, below)
    // must already be built: this test does not build word shards itself.
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

    const s1 = (await session.submit("s peach/ti")).map(l => l.text);
    // A word kind's per-term line always prints (session.ts's `cmd.expr.kind !== "term"`
    // guard), so a single-code word SELECT still shows both the per-term postings line and
    // the set line, with the same count and the same echoed display on each.
    expect(s1).toEqual([
      setLine(null, acc.ti_peach.count, "PEACH/TI"),
      setLine(1, acc.ti_peach.count, "PEACH/TI"),
    ]);

    const ans = session.sets[0]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(ans).toEqual(acc.ti_peach.an);
  },
  120_000,
);
