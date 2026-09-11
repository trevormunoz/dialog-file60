import { mk } from "./harness";

// RANK's printed block, content and order read from Curso Introductorio DIALOG (1994) p.126
// (proto.rank.display, anchor-period, fully legible): "RANK Results", a dashed rule, the
// "RANK: Sn/1-N  Field: FF=  File(s): nnn" line, the "(N records - M terms)" count line, the
// three-line stacked column header (the 1994 page's own words and line structure, reproduced
// verbatim -- the anchor rule now covers the header like the other three RANK display elements),
// and one row per ranked term. Row column character widths are this reconstruction's own choice
// (proto.rank.columns), not read from either source -- the same rule Task 2 applied to format
// 6's typeset worked output.
// The fixture's one real record (harness.ts) carries both CY=BELTSVILLE and CY=GREENBELT on
// the same ordinal (harness.ts's own note on why: this fixture holds one real record, so
// every set built from it is that one record or the empty set), so RANKing CY over the
// one-item CY=BELTSVILLE set correctly returns both terms, each with count 1 -- ties broken
// by collation (BELTSVILLE before GREENBELT).
test("RANK over a phrase-indexed field prints the RANK Results block for the one real record this fixture holds", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("rank cy")).map(l => l.text)).toEqual([
    "RANK Results",
    "-------------",
    "",
    "RANK: S1/1-1  Field: CY=  File(s): 60",
    "(1 records - 2 terms)",
    "",
    "RANK  No.Items",
    "No.   Ranked  Term",
    "---   -------- ----",
    "1     1       BELTSVILLE",
    "2     1       GREENBELT",
  ]);
});

// RANK <field> with no Sn ranks the most recently created set, the same implicit-set reading
// Successful Searching on Dialog's two command formats leave RANK <field> (bare) to mean.
test("RANK with no Sn ranks the most recently created set", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("rank cy")).map(l => l.text)).toEqual((await s.submit("rank cy s1")).map(l => l.text));
});

// 2001: "RANK is designed to work with most phrase-indexed Additional Index fields... However,
// to minimize retrieval of inappropriate data, RANK does not work in any word-indexed fields."
// TI is word-indexed only in this build (WORD_FIELDS['/TI']) -- the refusal is
// proto.rank.wordfields's own message, printed with the simulated `?` form, not the generic
// unknown-field one SORT uses.
test("RANK on a word-indexed field (TI) is refused, the same simulated error form SELECT and SORT use", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("rank ti")).map(l => l.text)).toEqual(["? TI"]);
});

test("RANK naming a set that does not exist prints the simulated error, the same S<n> form SORT uses", async () => {
  const s = mk();
  await s.submit("b 60");
  expect((await s.submit("rank cy s9")).map(l => l.text)).toEqual(["? S9"]);
});

test("RANK on a field this build indexes neither by word nor by phrase is refused with the generic unknown-field message", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("rank zz")).map(l => l.text)).toEqual(["? ZZ"]);
});
