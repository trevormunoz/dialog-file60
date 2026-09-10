import { mk } from "./harness";

test("LOGOFF prices the session after a record typed in format 5", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  await s.submit("t s1/5/1");
  const out = (await s.submit("logoff")).map(l => l.text);
  expect(out).toEqual([
    "          03may94 10:00:00 User013140",
    "   $0.00   0.000 Hrs File60",
    "   $0.60   1 Types in Format 5",
    "   $0.60   Estimated cost File60",
    "   $0.60   Estimated cost this search",
    "LOGOFF 10:00:00",
  ]);
});

test("LOGOFF ends the session: a following SELECT prints the before-BEGIN error", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("logoff");
  expect(s.currentFile).toBeNull();
  expect((await s.submit("s cy=beltsville")).map(l => l.text)).toEqual(["? CY=BELTSVILLE"]);
});

test("with accounting off, BEGIN prints no stamp and LOGOFF prints only its final line", async () => {
  const s = mk({ accounting: false });
  const beginOut = (await s.submit("b 60")).map(l => l.text);
  expect(beginOut).toEqual([
    "",
    "File  60:CRIS/USDA - Current Research",
    "",
    "      Set  Items  Description",
    "      ---  -----  -----------",
  ]);
  const logoffOut = (await s.submit("logoff")).map(l => l.text);
  expect(logoffOut).toEqual(["LOGOFF 10:00:00"]);
});
