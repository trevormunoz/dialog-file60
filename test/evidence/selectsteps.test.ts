import { mk } from "./harness";

test("SS assigns a set per operand and a final set, and prints Processing first", async () => {
  const s = mk(); await s.submit("b 60");
  const out = (await s.submit("ss cy=beltsville and in=hammerschlag  f a")).map(l => l.text);
  expect(out[0]).toBe("Processing");
  expect(out.slice(1)).toEqual([
    "      S1       1  CY=BELTSVILLE",
    "      S2       1  IN=HAMMERSCHLAG  F A",
    "      S3       1  CY=BELTSVILLE AND IN=HAMMERSCHLAG  F A",
  ]);
  expect(s.sets.map(x => x.id)).toEqual([1, 2, 3]);
});

test("SS of a single operand numbers one set, with no repeated line", async () => {
  const s = mk(); await s.submit("b 60");
  expect((await s.submit("ss cy=beltsville")).map(l => l.text)).toEqual([
    "Processing",
    "      S1       1  CY=BELTSVILLE",
  ]);
});

test("the final SS set can be referenced like any other", async () => {
  const s = mk(); await s.submit("b 60"); await s.submit("ss cy=beltsville and in=hammerschlag  f a");
  expect((await s.submit("s s3")).map(l => l.text)).toEqual(["      S4       1  S3"]);
});

test("SS before BEGIN prints the simulated error form, like SELECT", async () => {
  const s = mk();
  expect((await s.submit("ss cy=beltsville")).map(l => l.text)).toEqual(["? CY=BELTSVILLE"]);
});
