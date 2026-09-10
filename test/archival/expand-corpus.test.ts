import { existsSync, readFileSync } from "node:fs";
import { buildIndexes } from "../../src/loader/index-builder";
import { RetrievalEngine } from "../../src/retrieval/engine";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { DialogSession, setLine } from "../../src/dialog/session";
import { render5 } from "../../src/dialog/render5";

// EXPAND and PAGE exercised end to end against the real IN index, the same pattern
// test/archival/boolean-corpus.test.ts uses for OR and NOT.
const FILE = "data/RG164.CRIS.FY94.txt";
const exists = existsSync(FILE);
const skip = !exists && process.env.CRIS_CORPUS_OPTIONAL === "1";

test.skipIf(skip)(
  "e in=hammerschlag: twelve rows, the entered term third, item counts matching the loaded IN index; p, p- and s e3 against the real corpus",
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
    for (const row of opened!.rows) expect(row.items).toBe((indexes.IN!.terms[row.term] ?? []).length);

    await session.submit("p");
    const paged = session.expand!;
    expect(paged.rows.map(r => r.ref)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(paged.rows.every(r => !r.starred)).toBe(true);

    await session.submit("p-");
    const back = session.expand!;
    expect(back.rows.map(r => r.ref)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(back.rows.every(r => !r.starred)).toBe(true);
    expect(back.rows.map(r => r.term)).toEqual(opened!.rows.map(r => r.term));

    const target = back.rows.find(r => r.ref === 3)!;
    const setLines = (await session.submit("s e3")).map(l => l.text);
    expect(setLines.at(-1)).toBe(setLine(1, target.items, "E3"));
    expect(session.sets[0]!.ordinals.length).toBe(target.items);
  },
  120_000,
);
