import { readFileSync } from "node:fs";
import { setLine } from "../../src/dialog/session";
import { mk, seenFormats } from "./harness";

// Pinned against the transcribed 1994 session rather than a duplicated literal, so the
// fixture and this assertion cannot silently diverge from each other.
const curso = readFileSync("fixtures/1994-curso-pais.txt", "utf8").split("\n");
const cursoSetLines = curso.filter(l => /^\s*S\d+\s+\d+\s+\S/.test(l));

test("set line columns follow the 1994 sheet", () => {
  expect(cursoSetLines).toHaveLength(3); // S1, S2, S3
  for (const expected of cursoSetLines) {
    const [, id, items, desc] = expected.match(/^\s*S(\d+)\s+(\d+)\s+(\S.*)$/)!;
    expect(setLine(Number(id), Number(items), desc!)).toBe(expected);
  }
  expect(setLine(null, 70, "LAETRILE")).toBe("              70  LAETRILE");
});

test("BEGIN prints the date/time/user stamp, banner and dashed header, no cost block when no file was open", async () => {
  const s = mk();
  const out = (await s.submit("b 60")).map(l => l.text);
  expect(out).toEqual([
    "          03may94 10:00:00 User013140",
    "",
    "File  60:CRIS/USDA - Current Research",
    "",
    "      Set  Items  Description",
    "      ---  -----  -----------",
  ]);
  expect(s.currentFile).toBe(60);
});

test("SELECT prints per-term postings only for multi-term expressions, then the set line", async () => {
  const s = mk(); await s.submit("b 60");
  expect((await s.submit("s cy=beltsville")).map(l => l.text)).toEqual(["      S1       1  CY=BELTSVILLE"]);
  expect((await s.submit("s s1 and in=hammerschlag  f a")).map(l => l.text)).toEqual([
    "               1  IN=HAMMERSCHLAG  F A",
    "      S2       1  S1 AND IN=HAMMERSCHLAG  F A",
  ]);
  expect(s.sets.map(x => x.id)).toEqual([1, 2]);
});

// The set line's registryKeys must include
// render.record.order (the set's items are in the order they sit in the file), and the
// per-term line's must include index.phrase.uppercase (the rule that uppercased the term
// shown), alongside the keys each line already cited.
test("SELECT's per-term and set lines carry index.phrase.uppercase and render.record.order", async () => {
  const s = mk(); await s.submit("b 60"); await s.submit("s cy=beltsville");
  const out = await s.submit("s s1 and in=hammerschlag  f a");
  const [perTermLine, setLineOut] = out;
  expect(perTermLine!.provenance?.registryKeys).toContain("index.phrase.uppercase");
  expect(setLineOut!.provenance?.registryKeys).toContain("render.record.order");
});

test("TYPE delegates to the renderer with the ordinal's record; unknown set errors", async () => {
  const s = mk(); await s.submit("b 60"); await s.submit("s cy=beltsville");
  const out = await s.submit("t s1/5/1");
  expect(out[0]!.text).toBe("");
  expect(out[1]!.text).toBe("1/5/1");
  expect(out.at(-1)!.text).toBe("<record 9049442>");
  expect(out[1]!.provenance?.recordOrdinal).toBe(0);
  expect((await s.submit("t s9/5/1"))[0]!.text).toMatch(/S9/);
});

test("TYPE with an unsupported format prints the renderer's '? /<format>' response, citing proto.error.bad_format", async () => {
  const s = mk(); await s.submit("b 60"); await s.submit("s cy=beltsville"); await s.submit("s s1 and in=hammerschlag  f a");
  await s.submit("t s2/5/1");
  expect((await s.submit("t s2/6/1")).at(-1)).toEqual({ text: "? /6", provenance: { registryKeys: ["proto.error.bad_format"], recordOrdinal: 0 } });
  expect((await s.submit("t s2/in,ob/1")).at(-1)).toEqual({ text: "? /IN,OB", provenance: { registryKeys: ["proto.error.bad_format"], recordOrdinal: 0 } });
  expect(seenFormats).toEqual(["5", "6", "IN,OB"]);
});

test("a new BEGIN erases sets", async () => {
  const s = mk(); await s.submit("b 60"); await s.submit("s cy=beltsville"); await s.submit("b 60");
  expect(s.sets).toEqual([]);
});

test("TYPE past the end of a set prints the existing item, then the first missing item's error", async () => {
  const s = mk(); await s.submit("b 60"); await s.submit("s cy=beltsville");
  const out = await s.submit("t s1/5/1-3");
  expect(out.some(l => l.text === "1/5/1")).toBe(true);
  expect(out.at(-1)).toEqual({ text: "? 2", provenance: { registryKeys: ["proto.error.type_range"] } });
});

test("a SELECT referencing an unset set number prints S<n>, an unknown field prints FIELD=TERM, never the raw exception text", async () => {
  const s = mk(); await s.submit("b 60");
  expect((await s.submit("s s7")).map(l => l.text)).toEqual(["? S7"]);
  expect((await s.submit("s zz=x")).map(l => l.text)).toEqual(["? ZZ=X"]);
});

// SELECT and TYPE meet the identical condition -- a set number that was never set -- so both
// cite the same dedicated key. Neither proto.error.unknown_field (whose claim is about an
// unrecognized field code, not a set number) nor proto.error.type_range (whose claim is about
// a range) covers it.
test("an unknown set number, whether named by SELECT or TYPE, cites proto.error.unknown_set", async () => {
  const s = mk(); await s.submit("b 60");
  const selectOut = await s.submit("s s7");
  expect(selectOut).toEqual([{ text: "? S7", provenance: { registryKeys: ["proto.error.unknown_set"] } }]);
  const typeOut = await s.submit("t s9/5/1");
  expect(typeOut).toEqual([{ text: "? S9", provenance: { registryKeys: ["proto.error.unknown_set"] } }]);
});

test("an unknown field (not a set) still cites proto.error.unknown_field", async () => {
  const s = mk(); await s.submit("b 60");
  const out = await s.submit("s zz=x");
  expect(out).toEqual([{ text: "? ZZ=X", provenance: { registryKeys: ["proto.error.unknown_field"] } }]);
});

// "e" is a recognized capability-notice command word (EXPAND), not an unrecognized one, so
// the genuinely-unknown case pinned here is "zx" -- no command word this milestone recognizes
// in any form. OR itself now parses (proto.select.boolean); the failing SELECT below still
// does not, because "smith?" carries a reserved character in its value.
test("the bare ? never stands alone: an unrecognized command echoes its first token, a failed SELECT its first operand", async () => {
  const s = mk(); await s.submit("b 60");
  expect((await s.submit("zx cy=beltsville")).map(l => l.text)).toEqual(["? ZX"]);
  expect((await s.submit("s cy=beltsville or in=smith?")).map(l => l.text)).toEqual(["? CY=BELTSVILLE OR IN=SMITH?"]);
});

// A TYPE the parser recognizes as TYPE (T/TYPE) but whose remainder
// matches neither implemented form blames that remainder, not bare "T".
test("a malformed TYPE names its unparsed remainder, not the bare command word", async () => {
  const s = mk(); await s.submit("b 60");
  expect((await s.submit("t 5")).map(l => l.text)).toEqual(["? 5"]);
});

test("a SELECT before any BEGIN also names an offending token, never a bare ?", async () => {
  const s = mk();
  expect((await s.submit("s cy=beltsville")).map(l => l.text)).toEqual(["? CY=BELTSVILLE"]);
  expect((await s.submit("s s1 and in=hammerschlag  f a")).map(l => l.text)).toEqual(["? S1"]);
});

// A capability-notice stub. A command the parser recognizes as documented but out of this
// milestone's slice prints nothing into the character stream -- the session tracks it
// separately (lastNotice), for the app to show outside the stream.
describe("capability notices", () => {
  // EXPAND is implemented (test/evidence/expand.test.ts, test/regression/expand-window.test.ts)
  // and no longer belongs on this list; LOGOFF is implemented (test/evidence/logoff.test.ts)
  // and no longer belongs on it either.
  test("a recognized-but-unimplemented command prints nothing into the stream", async () => {
    const s = mk(); await s.submit("b 60");
    expect(await s.submit("sort")).toEqual([]);
    expect(await s.submit("t 09143165/5")).toEqual([]);
  });

  test("the session records the last capability notice, cleared by any other command", async () => {
    const s = mk(); await s.submit("b 60");
    expect(s.lastNotice).toBeNull();
    await s.submit("sort");
    expect(s.lastNotice).toEqual({ command: "SORT" });
    await s.submit("s cy=beltsville"); // an ordinary command clears the stale notice
    expect(s.lastNotice).toBeNull();
  });

  // A SELECT naming a Blue Sheet documented prefix with no built
  // index (this milestone builds only CY, IN, DS, ST, SF, AN) answers with the same channel
  // as EXPAND/LOGOFF, not the simulated typo error -- FY= is a real File 60 search the
  // reconstruction has not implemented, not a mistyped field code.
  test("a documented File 60 prefix with no built index routes to the capability-notice channel, not the simulated typo error", async () => {
    const s = mk(); await s.submit("b 60");
    expect(await s.submit("s fy=1992")).toEqual([]);
    expect(s.lastNotice).toEqual({ command: "FY= (search prefix)" });
  });

  test("a field the Blue Sheet does not document still gets the simulated typo error, not a capability notice", async () => {
    const s = mk(); await s.submit("b 60");
    expect((await s.submit("s zz=x")).map(l => l.text)).toEqual(["? ZZ=X"]);
    expect(s.lastNotice).toBeNull();
  });
});

