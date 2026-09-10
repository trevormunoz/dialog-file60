import { expandWindow, expandPage, expandLines } from "../../src/dialog/expand";

const terms: [string, number][] = [
  ["SNOOK A", 1], ["SNOOK G", 2], ["SNOOK H L", 3], ["SNOOK K", 4], ["SNOOK M", 5],
  ["SNOOK N", 6], ["SNOOK P", 7], ["SNOOK Q", 8], ["SNOOK R", 9], ["SNOOK S", 10],
  ["SNOOK T", 11], ["SNOOK U", 12], ["SNOOK V", 13], ["SNOOK W", 14],
];
const page = (entered: string) => {
  const w = expandWindow(terms, entered);
  return expandPage({ terms, start: w.start, firstRef: 1, entered, enteredAt: w.enteredAt, absent: w.absent, code: "IN=" });
};

test("the entered term sits third, with two rows above it", () => {
  expect(expandWindow(terms, "SNOOK H L")).toEqual({ start: 0, enteredAt: 2, absent: false });
  expect(page("SNOOK K").rows[2]).toEqual({ ref: 3, items: 4, term: "SNOOK K", starred: true });
});

test("an absent term is inserted in sort order, starred, with zero items", () => {
  expect(page("SNOOK J T").rows[2]).toEqual({ ref: 3, items: 0, term: "SNOOK J T", starred: true });
});

test("at either end of an index the window is shifted, not padded", () => {
  expect(page("SNOOK A").rows).toHaveLength(12);
  expect(page("SNOOK A").rows[0]!.term).toBe("SNOOK A");
  const last = page("SNOOK W");
  expect(last.rows).toHaveLength(12);
  expect(last.rows[11]!.term).toBe("SNOOK W");
  expect(last.more).toBe(false);
});

test("the printed page carries the header and prints the more line only when more rows exist", () => {
  const lines = expandLines(page("SNOOK H L"));
  expect(lines[0]).toBe("Ref   Items  Index-term");
  expect(lines[1]).toBe("E1        1  SNOOK A");
  expect(lines[3]).toBe("E3        3  *SNOOK H L");
  expect(lines.at(-1)).toBe("          Enter P or PAGE for more");
  expect(expandLines(page("SNOOK W")).at(-1)).toBe("E12      14  *SNOOK W");
});

test("E numbers run to E50 and then restart at E1", () => {
  const next = expandPage({ terms, start: 0, firstRef: 49, entered: null, enteredAt: null, absent: false, code: "IN=" });
  expect(next.rows.map(r => r.ref)).toEqual([49, 50, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(next.rows.every(r => !r.starred)).toBe(true);
});
