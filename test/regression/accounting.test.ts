import { stamp, logoffBlock } from "../../src/dialog/accounting";

const rates = { perMinute: 0.25, typeByFormat: { "5": 0.6, "6": 0, "K": null } };

test("the stamp is the documented date, time and user form", () => {
  expect(stamp(new Date(Date.UTC(1978, 1, 28, 14, 17, 38)), "316")).toBe("          28feb78 14:17:38 User316");
});

test("the logoff block prices connect time and each format typed", () => {
  const start = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  const end = new Date(Date.UTC(1994, 4, 3, 10, 6, 0));
  expect(logoffBlock({ start, end, user: "013140", types: { "5": 2 }, prints: {}, rates })).toEqual([
    "          03may94 10:06:00 User013140",
    "  $1.50  0.100 Hrs File60",
    "  $1.20  2 Types in Format 5",
    "  $2.70  Estimated cost File60",
    "  $2.70  Estimated cost this search",
  ]);
});

test("a free format prints its line at zero rather than being dropped", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  expect(logoffBlock({ start: t, end: t, user: "1", types: { "6": 1 }, prints: {}, rates })).toContain("  $0.00  1 Types in Format 6");
});

test("no TYPE means no Types line at all", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  expect(logoffBlock({ start: t, end: t, user: "1", types: {}, prints: {}, rates }).some(l => l.includes("Types"))).toBe(false);
});

// proto.accounting.prints: the 1978 File 60 session's own Prints line ("$3.50 35 Prints"),
// priced here from the same typeByFormat table as Types -- the 1998 rate card's Types and
// Prints columns match for every numeric format row.
test("the logoff block prices each format printed, beneath the Types lines, unlabeled by format", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  expect(logoffBlock({ start: t, end: t, user: "1", types: { "5": 1 }, prints: { "5": 35 }, rates })).toEqual([
    "          03may94 10:00:00 User1",
    "  $0.00  0.000 Hrs File60",
    "  $0.60  1 Types in Format 5",
    "  $21.00  35 Prints",
    "  $21.60  Estimated cost File60",
    "  $21.60  Estimated cost this search",
  ]);
});

// The one case the 1998 rate card leaves illegible: a format whose typeByFormat entry is
// `null` (KWIC's Prints column reads "??") is skipped, never priced at an invented $0.00.
test("a format whose Prints rate is null is skipped, not priced at zero", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  const out = logoffBlock({ start: t, end: t, user: "1", types: {}, prints: { K: 4 }, rates });
  expect(out.some(l => l.includes("Prints"))).toBe(false);
  expect(out).toContain("  $0.00  Estimated cost File60");
});

test("no PRINT means no Prints line at all", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  expect(logoffBlock({ start: t, end: t, user: "1", types: {}, prints: {}, rates }).some(l => l.includes("Prints"))).toBe(false);
});
