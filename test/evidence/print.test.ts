import { mk } from "./harness";

// PRINT, from the 28 February 1978 File 60 session (EPA Chemical Information Resources
// Handbook, January 1981, p. 185): "? PRINT 16/5/1-35/AS/PN" answered "Printed16/5/1-35/AS/PN"
// -- one acknowledgement line, the request echoed, no transaction number, no cost. This
// reconstruction adopts that form over the 2001 manual's later transaction-number/estimated-cost
// form (see proto.print.ack's conflicts). PRINT produces no artefact -- the printed pages a real
// PRINT made were produced offline and are not part of this reconstruction
// (printouts-memo-evaluation.md) -- so PRINT only acknowledges and counts. The missing space in
// "Printed16/5/..." is in the printed 1978 original and is preserved, not corrected.

test("PRINT acknowledges the request in the 1978 File 60 form and produces nothing else", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("print 1/5/1-35/as/pn")).map(l => l.text)).toEqual(["Printed1/5/1-35/AS/PN"]);
});

test("PRINT takes the S-prefixed set form, as the Blue Sheet's own PRINT S5/5/ZP writes it", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("print s1/5/1")).map(l => l.text)).toEqual(["PrintedS1/5/1"]);
});

test("PRINT naming a set that does not exist prints the simulated error, the same S<n> form TYPE uses", async () => {
  const s = mk();
  await s.submit("b 60");
  expect((await s.submit("print 1/5/1-35/as/pn")).map(l => l.text)).toEqual(["? S1"]);
});

test("PRINT by accession number is a capability notice, the same channel TYPE by accession number uses", async () => {
  const s = mk();
  await s.submit("b 60");
  expect((await s.submit("print 09136021/2")).map(l => l.text)).toEqual([]);
});

// This harness's CY=BELTSVILLE set is the single real record fixture (AN 9049442, one item,
// see harness.ts) -- a range naming items past that (1-10) must bill only the one item that
// actually exists, the same clamp TYPE applies via set.ordinals[i-1] (commands/type.ts), not
// the ten items the range names. A range wholly inside the set's real size is billed against
// the real corpus's own multi-item Beltsville set in test/archival/sort-corpus.test.ts's
// neighbourhood; this harness cannot exercise that case with only one record held.
test("LOGOFF prices the prints actually in the set, clamped to its real size, not the requested range", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  await s.submit("print 1/5/1-10");
  const out = (await s.submit("logoff")).map(l => l.text);
  expect(out).toContainEqual("  $0.60  1 Prints");
});

test("LOGOFF prices a PRINT ALL as the whole set's item count", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville"); // one real record in this fixture
  await s.submit("print 1/5/all");
  const out = (await s.submit("logoff")).map(l => l.text);
  expect(out).toContainEqual("  $0.60  1 Prints");
});

// The 1998 rate card's Prints price for KWIC formats (K) is illegible ("??" in the capture) --
// proto.accounting.prints records this as a statement of absence. PRINT of a format-K set still
// acknowledges, but LOGOFF must never invent a $0.00 price for it: the format is skipped from
// the Prints lines entirely, not priced at zero.
test("PRINT of format K is acknowledged but LOGOFF prices no Prints line for it -- its rate is illegible, not free", async () => {
  const s = mk();
  await s.submit("b 60");
  await s.submit("s cy=beltsville");
  expect((await s.submit("print 1/k/1")).map(l => l.text)).toEqual(["Printed1/K/1"]);
  const out = (await s.submit("logoff")).map(l => l.text);
  expect(out.some(l => / Prints$/.test(l))).toBe(false);
});
