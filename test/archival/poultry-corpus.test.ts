import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FsWordIndex } from "../../src/retrieval/words-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";
import { rankTally } from "../../src/dialog/rank";
import { kwicLines } from "../../src/dialog/kwic";
import { PHRASE_FIELDS, type Offsets, type Index } from "../../src/loader/corpus-format";

// <FIELD> pinned to /TI (Task 1): titles read cleanly in KWIC, and POULTRY/TI gives a healthy,
// printable set -- see fixtures/SOURCES.md for the TI/DE/TX record counts checked before
// picking it. <RANKFIELD> pinned to IN (Task 1's default): RANK IN over the POULTRY/TI set
// showed a legible descending shape (a handful of investigators with several poultry projects
// each), confirmed against fixtures/acceptance-fy94.json's independently-derived
// rank_in_over_poultry before this test was written to pass -- see fixtures/ACCEPTANCE.md.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";
const acc = JSON.parse(readFileSync("fixtures/acceptance-fy94.json", "utf8"));

async function buildEngine(): Promise<RetrievalEngine> {
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
  return new RetrievalEngine(offsets, indexes, new FsRangeReader(FILE), "fy1991plus", new FsWordIndex("public/corpus"));
}

function session(engine: RetrievalEngine): DialogSession {
  return new DialogSession(engine, (rec, format) => (format === "5" ? render5(rec) : [{ text: `? /${format}` }]));
}

test.skipIf(skip)(
  "SELECT POULTRY/TI builds the derived set",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const engine = await buildEngine();
    const s = session(engine);
    await s.submit("b 60");
    const out = (await s.submit("s poultry/ti")).map(l => l.text).join("\n");
    expect(out).toContain(setLine(1, acc.poultry_ti.count, "POULTRY/TI"));
    expect(s.sets[0]!.ordinals.length).toBe(acc.poultry_ti.count);
  },
  120_000,
);

test.skipIf(skip)(
  "RANK IN over the poultry set matches the independent tally",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const engine = await buildEngine();
    const s = session(engine);
    await s.submit("b 60");
    await s.submit("s poultry/ti");
    const set = s.sets[0]!.ordinals;
    const rows = rankTally(engine.rankValues("IN", set));
    const derived: [string, number][] = acc.rank_in_over_poultry;
    expect(derived.length).toBeGreaterThan(0);
    expect(rows.map(r => [r.term, r.items])).toEqual(derived);
  },
  120_000,
);

test.skipIf(skip)(
  "KWIC of POULTRY in the chosen record matches the derived window",
  async () => {
    if (!exists) {
      throw new Error(
        `missing ${FILE} -- run scripts/extract-corpus.py to produce it, or set CRIS_CORPUS_OPTIONAL=1 to skip archival tests`,
      );
    }
    const engine = await buildEngine();
    const s = session(engine);
    await s.submit("b 60");
    await s.submit("s poultry/ti");
    const ordinals = s.sets[0]!.ordinals;
    // AN chosen in scripts/naive-split.py: the alphabetically-first AN in the poultry set
    // (fixtures/acceptance-fy94.json's kwic_<AN>_ti_poultry_14 key names it).
    const wantAn = Object.keys(acc).find(k => /^kwic_\d+_ti_poultry_14$/.test(k))!.match(/^kwic_(\d+)_ti_poultry_14$/)![1]!;
    let rec;
    for (const ord of ordinals) {
      const r = await engine.record(ord);
      if (r.an === wantAn) { rec = r; break; }
    }
    expect(rec, `record AN ${wantAn} not found in the POULTRY/TI set`).toBeDefined();
    await s.submit("set kwic 14");
    const windows = kwicLines(rec!, [{ term: "POULTRY", prefix: false }], 14).map(l => l.text);
    expect(windows).toContain(acc[`kwic_${wantAn}_ti_poultry_14`]);
  },
  120_000,
);
