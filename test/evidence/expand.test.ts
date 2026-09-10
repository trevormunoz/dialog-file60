import { DialogSession } from "../../src/dialog/session";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";
import { expandWindow, expandPage, expandLines } from "../../src/dialog/expand";

// Spec 7.3's transcribed EXPAND block shows a dozen SNOOK-prefixed IN terms with the entered
// term, "SNOOK J T", absent from the index and inserted third, starred, with zero items --
// the item counts themselves are redacted in the source ("n"), so this stub term list carries
// plausible documented-shaped counts instead, standing in for the real index.
const terms: [string, number][] = [
  ["SNOOK", 3], ["SNOOK G", 2], ["SNOOK H L", 1], ["SNOOK K", 4], ["SNOOK M", 1],
  ["SNOOK N", 2], ["SNOOK P", 1], ["SNOOK Q", 1], ["SNOOK R", 3], ["SNOOK S", 1],
  ["SNOOK T", 2], ["SNOOK U", 1], ["SNOOK V", 1], ["SNOOK W", 1],
];
const indexes = {
  IN: { code: "IN", terms: Object.fromEntries(terms.map(([t, n]) => [t, Array.from({ length: n }, (_, i) => i)])) },
};
const reader: RangeReader = { async read() { return new Uint8Array(0); } };
const mk = () => new DialogSession(new RetrievalEngine({ file: "x", sha256: "x", records: [] }, indexes, reader, "fy1991plus"), () => []);

test("EXPAND replays spec 7.3's shape through the session: twelve rows, the entered term third, starred and zero-item since it is absent, and the more line", async () => {
  const s = mk();
  await s.submit("b 60");
  const printed = (await s.submit("e in=snook j t")).map(l => l.text);

  const w = expandWindow(terms, "SNOOK J T");
  const expected = expandLines(
    expandPage({ terms, start: w.start, firstRef: 1, entered: "SNOOK J T", enteredAt: w.enteredAt, absent: w.absent, code: "IN" }),
  );
  expect(printed).toEqual(expected);
  expect(printed[0]).toBe("Ref   Items  Index-term");
  expect(printed[3]).toBe("E3        0  *SNOOK J T");
  expect(printed.at(-1)).toBe("          Enter P or PAGE for more");
  expect(s.expand?.code).toBe("IN");
});

test("EXPAND with only the prefix code starts at the head of the index, nothing starred", async () => {
  const s = mk();
  await s.submit("b 60");
  const printed = (await s.submit("e in=")).map(l => l.text);
  expect(printed[1]).toBe("E1        3  SNOOK");
  expect(printed.every(l => !l.includes("*"))).toBe(true);
});
