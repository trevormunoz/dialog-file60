import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";
import { PHRASE_FIELDS, type Offsets, type Index } from "../../src/loader/corpus-format";

// S TECHNOLOG?/TI runs end to end through RetrievalEngine and DialogSession against the real
// corpus and the prebuilt word-index shards, the same layout test/archival/word-corpus.test.ts
// already reads. The expected count and AN list come from fixtures/acceptance-fy94.json's
// ti_technolog field, derived independently by scripts/naive-split.py's own tokenizer -- not
// from this test's own build. The phrase-field prefix scan (CY=BELTSVILL?) has no SELECT
// grammar in this task (a PREFIX=value? truncation is documented by the Blue Sheet but not
// implemented here -- see docs/not-implemented.md and registry key proto.select.truncation),
// so it is asserted directly against RetrievalEngine.prefixPostings, checked against
// cy_beltsvill_trunc.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "S TECHNOLOG?/TI runs end to end against the real corpus, and a phrase-field prefix scan matches an independent check",
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

    const s1 = (await session.submit("s technolog?/ti")).map(l => l.text);
    // A single-operand truncation prints its own set line only -- no separate per-term line
    // (2001: "?select forecast?" -> one line; the 1978 File 60 session: "SELECT LOBSTER?" ->
    // one line).
    expect(s1).toEqual([setLine(1, acc.ti_technolog.count, "TECHNOLOG?/TI")]);

    const ans = session.sets[0]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(ans).toEqual(acc.ti_technolog.an);

    // The phrase-field case: no SELECT grammar exists for CY=BELTSVILL? in this task, so the
    // prefix scan is checked directly against the engine.
    const phraseOrds = await engine.prefixPostings("CY", "BELTSVILL");
    const phraseAns = phraseOrds.map(o => offsets.records[o]![0]).sort();
    expect(phraseAns).toEqual(acc.cy_beltsvill_trunc.an);
  },
  120_000,
);
