import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";

// The acceptance session exercised end to end through
// RetrievalEngine and DialogSession against the real corpus, not re-implemented inline the
// way test/archival/loader.test.ts's full-file test computes its own AND. The expected
// counts and AN list come from fixtures/acceptance-fy94.json, the independently-derived
// answer (see test/archival/naive-rederive.test.ts) -- not from this test's own build, which
// would only prove the session agrees with itself.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

test.skipIf(skip)(
  "B 60 / S CY=BELTSVILLE / S S1 AND IN=HAMMERSCHLAG  F A / T S2/5/1 runs end to end against the real corpus",
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

    const s1 = (await session.submit("s cy=beltsville")).map(l => l.text);
    expect(s1).toEqual([setLine(1, acc.cy_beltsville.count, "CY=BELTSVILLE")]);

    // The per-term postings line is checked against
    // fixtures/acceptance-fy94.json's in_hammerschlag_f_a count -- an independently derived
    // number (scripts/naive-split.py, a query over the whole corpus for IN=HAMMERSCHLAG F A
    // regardless of CY) -- not against indexes.IN, which the session under test built itself
    // and so could never disagree with.
    const s2 = (await session.submit("s s1 and in=hammerschlag  f a")).map(l => l.text);
    expect(s2).toEqual([
      setLine(null, acc.in_hammerschlag_f_a.count, "IN=HAMMERSCHLAG  F A"),
      setLine(2, acc.cy_beltsville_and_in_hammerschlag_f_a.count, "S1 AND IN=HAMMERSCHLAG  F A"),
    ]);

    const ans = session.sets[1]!.ordinals.map(o => offsets.records[o]![0]).sort();
    expect(ans).toEqual(acc.cy_beltsville_and_in_hammerschlag_f_a.an);

    const typed = (await session.submit("t s2/5/1")).map(l => l.text);
    expect(typed).toContain(" 09049442");
  },
  120_000,
);
