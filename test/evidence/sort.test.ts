import { mk } from "./harness";

test("SORT makes a new set whose description is the command's own argument", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  const out = await s.submit("sort s1/all/pn");
  // This harness's CY=BELTSVILLE set is the single real record fixture (AN 9049442, one
  // item) -- the real corpus's 669-item Beltsville set and its true PN order are asserted
  // against the real corpus in test/archival/sort-corpus.test.ts, derived independently in
  // scripts/naive-split.py. The brief's regex also omitted the "S" before the set number;
  // corrected here the same way test/evidence/truncation.test.ts already corrected the same
  // kind of error -- setLine() always prints "S<n>", never a bare digit.
  expect(out.map(l => l.text)).toEqual([expect.stringMatching(/^ +S2 +1 +Sort S1\/ALL\/PN$/)]);
});

test("a field the Blue Sheet does not list as sortable is refused", async () => {
  const s = mk();
  await s.submit("b 60"); await s.submit("s cy=beltsville");
  expect((await s.submit("sort s1/all/ob")).map(l => l.text)).toEqual(["? OB"]);
});
