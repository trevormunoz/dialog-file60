import { stamp, logoffBlock } from "../../src/dialog/accounting";

const rates = { perMinute: 0.25, typeByFormat: { "5": 0.6, "6": 0 } };

test("the stamp is the documented date, time and user form", () => {
  expect(stamp(new Date(Date.UTC(1978, 1, 28, 14, 17, 38)), "316")).toBe("          28feb78 14:17:38 User316");
});

test("the logoff block prices connect time and each format typed", () => {
  const start = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  const end = new Date(Date.UTC(1994, 4, 3, 10, 6, 0));
  expect(logoffBlock({ start, end, user: "013140", types: { "5": 2 }, rates })).toEqual([
    "          03may94 10:06:00 User013140",
    "   $1.50   0.100 Hrs File60",
    "   $1.20   2 Types in Format 5",
    "   $2.70   Estimated cost File60",
    "   $2.70   Estimated cost this search",
  ]);
});

test("a free format prints its line at zero rather than being dropped", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  expect(logoffBlock({ start: t, end: t, user: "1", types: { "6": 1 }, rates })).toContain("   $0.00   1 Types in Format 6");
});

test("no TYPE means no Types line at all", () => {
  const t = new Date(Date.UTC(1994, 4, 3, 10, 0, 0));
  expect(logoffBlock({ start: t, end: t, user: "1", types: {}, rates }).some(l => l.includes("Types"))).toBe(false);
});
