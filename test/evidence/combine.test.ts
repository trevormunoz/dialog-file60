import { mk } from "./harness";

// COMBINE, from the 28 February 1978 File 60 session (EPA Chemical Information Resources
// Handbook, January 1981, pp. 184-185) -- the only source in the collection that shows
// COMBINE. Both forms it shows: the range-and-operator form ("? COMBINE 1-7/OR") and the
// expression form over bare set numbers ("? COMBINE (8 AND 12) NOT 15"). This harness's fixture
// is FY 1994 File 60, not the 1978 session's own file, so the counts here differ from 1978's --
// these tests assert the forms (one set line, no per-term lines, the statement as typed as the
// echo), not the 1978 counts. Real combined-set counts against the FY 1994 corpus are asserted
// independently in test/archival/combine-corpus.test.ts, against scripts/naive-split.py's
// already-derived cy_beltsville_or_greenbelt and cy_beltsville_not_st_maryland.
//
// setLine() always prints "S<n>" for a set number, never a bare digit (see
// test/evidence/sort.test.ts's own note on the same point) -- the 1978 transcript's own bare
// digits are its typeset column, not this reconstruction's set-line form.

test("COMBINE over a range prints one set line whose description is the statement as typed", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville"); // S1
  await s.submit("s cy=greenbelt"); // S2
  const out = await s.submit("combine 1-2/or");
  expect(out).toHaveLength(1); // no per-term lines: the 1978 transcript shows none
  expect(out[0]!.text).toMatch(/^ +S3 +\d+ +1-2\/OR$/);
});

test("COMBINE takes bare set numbers, and the expression form keeps its parentheses", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  await s.submit("s cy=greenbelt");
  await s.submit("s st=maryland");
  const out = await s.submit("combine (1 or 2) not 3");
  expect(out[0]!.text).toMatch(/^ +S4 +\d+ +\(1 OR 2\) NOT 3$/);
});

test("COMBINE naming a set that does not exist prints the simulated error, echoing the bare number COMBINE's own grammar uses", async () => {
  const s = mk();
  await s.submit("b 60");
  expect((await s.submit("combine 1-2/or")).map(l => l.text)).toEqual(["? 1"]);
});
