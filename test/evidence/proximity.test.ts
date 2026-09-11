import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";
import { MemoryWordIndex } from "../../src/retrieval/words";
import type { PositionalSource } from "../../src/retrieval/words";
import type { PositionalShard } from "../../src/loader/corpus-format";
import { DialogSession, setLine } from "../../src/dialog/session";

// A synthetic two-record positional index over /TI only (POSITIONAL_CODES' first code), built
// by hand rather than from the real corpus -- this file checks the PRINTED SHAPE of a
// proximity SELECT (proto.select.proximity.perterm's "one line per leaf, then the combined
// line, then the set line", no new printing rule), not a real-corpus count; that independent
// check is test/archival/proximity-corpus.test.ts's job. Record 0: FRESH at word 3, WATER at
// word 4 of its one TI value (adjacent, in order -- matches (W)). Record 1: the same two words
// reversed, WATER at word 3, FRESH at word 4 (adjacent, but out of order -- fails (W), the same
// packed-position arithmetic test/regression/proximity.test.ts exercises directly).
const TI_SHARD_F: PositionalShard = { FRESH: { "0": [3], "1": [4] } };
const TI_SHARD_W: PositionalShard = { WATER: { "0": [4], "1": [3] } };
const posSource: PositionalSource = {
  async positions(code, shard) {
    if (code !== "/TI") return {};
    if (shard === "F") return TI_SHARD_F;
    if (shard === "W") return TI_SHARD_W;
    return {};
  },
};
const offsets = { file: "x", sha256: "x", records: [["AN0", 1, 1], ["AN1", 2, 2]] as [string, number, number][] };
const reader: RangeReader = { async read() { return new Uint8Array(); } };
const FIXED_CLOCK = { now: () => new Date(Date.UTC(1994, 4, 3, 10, 0, 0)) };

const mk = () =>
  new DialogSession(
    new RetrievalEngine(offsets, {}, reader, "fy1991plus", new MemoryWordIndex({}), posSource),
    () => [],
    { clock: FIXED_CLOCK },
  );

test("a proximity SELECT prints one line per leaf, then the combined line, then the set line", async () => {
  const session = mk();
  await session.submit("b 60");
  const out = (await session.submit("s fresh(w)water/ti")).map(l => l.text);
  expect(out).toEqual([
    setLine(null, 2, "FRESH"),
    setLine(null, 2, "WATER"),
    setLine(null, 1, "FRESH(W)WATER/TI"),
    setLine(1, 1, "FRESH(W)WATER/TI"),
  ]);
});

test("(N) matches both orders where (W) matches only one", async () => {
  const session = mk();
  await session.submit("b 60");
  const w = await session.submit("s fresh(w)water/ti");
  const n = await session.submit("s fresh(n)water/ti");
  expect(session.sets[0]!.ordinals).toEqual([0]); // (W): record 0 only (FRESH before WATER)
  expect(session.sets[1]!.ordinals).toEqual([0, 1]); // (N): both records (either order)
  expect(w.at(-1)!.text).toBe(setLine(1, 1, "FRESH(W)WATER/TI"));
  expect(n.at(-1)!.text).toBe(setLine(2, 2, "FRESH(N)WATER/TI"));
});

test("a proximity SELECT over an unshipped code (e.g. /TX) is refused, not silently accepted", async () => {
  const session = mk();
  await session.submit("b 60");
  const out = await session.submit("s fresh(w)water/tx");
  expect(out).toEqual([]); // routed to the capability-notice channel, outside the character stream
  expect(session.lastNotice).toEqual({ command: "(W)/(N)/(F) proximity over /TX" });
});
