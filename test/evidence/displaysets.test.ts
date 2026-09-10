import { mk } from "./harness";

test("DS prints the header and every set created since BEGIN", async () => {
  const s = mk(); await s.submit("b 60");
  await s.submit("s cy=beltsville"); await s.submit("s in=hammerschlag  f a");
  expect((await s.submit("ds")).map(l => l.text)).toEqual([
    "      Set  Items  Description",
    "      ---  -----  -----------",
    "      S1       1  CY=BELTSVILLE",
    "      S2       1  IN=HAMMERSCHLAG  F A",
  ]);
});

test("DS takes one set and a range, in either the bare or the S-prefixed form", async () => {
  const s = mk(); await s.submit("b 60");
  await s.submit("s cy=beltsville"); await s.submit("s in=hammerschlag  f a"); await s.submit("s s1 and s2");
  expect((await s.submit("ds s2")).map(l => l.text).slice(2)).toEqual(["      S2       1  IN=HAMMERSCHLAG  F A"]);
  expect((await s.submit("ds 1-2")).map(l => l.text).slice(2)).toHaveLength(2);
  expect((await s.submit("display sets s2-s3")).map(l => l.text).slice(2)).toHaveLength(2);
});

test("DS before any set prints the header alone, and BEGIN resets what DS shows", async () => {
  const s = mk(); await s.submit("b 60");
  expect((await s.submit("ds")).map(l => l.text)).toHaveLength(2);
  await s.submit("s cy=beltsville"); await s.submit("b 60");
  expect((await s.submit("ds")).map(l => l.text)).toHaveLength(2);
});

test("DS with no file open prints the simulated error form", async () => {
  const s = mk();
  expect((await s.submit("ds")).map(l => l.text)).toEqual(["? DS"]);
});
