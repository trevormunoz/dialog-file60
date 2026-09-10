import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { registry } from "../../src/registry";
import { sourceName } from "../../src/registry/words";
import { DialogSession } from "../../src/dialog/session";
import { RetrievalEngine, type RangeReader } from "../../src/retrieval/engine";

// The source scans below run in-process: a test never spawns a subprocess (a test that ran
// `npx tsx` inside a Vitest worker deadlocked the runner once; a grep call depends on the
// machine's grep and its flag behaviour, and hides the pattern from the reader).
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsFiles(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}
const packageSrcDirs = (): string[] =>
  readdirSync("packages").map(p => join("packages", p, "src")).filter(existsSync);
const matchesIn = (files: string[], re: RegExp): string[] =>
  files.flatMap(f => [...readFileSync(f, "utf8").matchAll(re)].map(m => m[1]!));

test("get returns a typed entry and throws on unknown keys", () => {
  expect(registry.get("dialog.file60.title").value).toBe("CRIS/USDA - Current Research");
  expect(() => registry.get("no.such.key")).toThrow(/unknown registry key/);
});

// fixtures/1994-curso-pais.txt (a different File 49 BEGIN transcript, the
// nearest in-period BEGIN evidence held) shows a copyright line printed after the banner --
// File 60's own database owner and copyright line are not recorded in any source held, so
// this reconstruction's BEGIN prints none, and that gap is a registry entry, not silence.
test("proto.begin.copyright_line documents the gap, chosen with no value", () => {
  const e = registry.get("proto.begin.copyright_line");
  expect(e.status).toBe("chosen");
  expect(e.value).toBeNull();
  expect(e.claim).toBe("No source holds File 60's database-owner copyright line, so this reconstruction prints none after the banner.");
});

// The aside can be hidden behind a collapse toggle; the registry
// note for the card mechanism it hides says so, and says hiding it is inert.
test("inspect.mode's note says the panel can be hidden and that hiding it changes nothing in the session", () => {
  const e = registry.get("inspect.mode");
  expect(e.note).toMatch(/hidden/);
  expect(e.note).toMatch(/changes nothing in the session/);
});

// A restart control: DIALOG had no clear command; a searcher ended
// with LOGOFF and dialed in again.
test("terminal.restart is chosen and names the period equivalent", () => {
  const e = registry.get("terminal.restart");
  expect(e.status).toBe("chosen");
  expect(e.claim).toBe("A button restarts the session; in the period a searcher logged off and dialed in again.");
});

// Screen mode's row cap is inferred from the IBM PC in the 1984 Computer Chronicles
// recording, whose text mode is 80x25; the Hazeltine 2000's earlier, out-of-period 27-line
// figure is not adopted -- see the note, which records that figure as unverified. The 1984 broadcast is Roger Summit demonstrating a live DIALOG search;
// what is not DIALOG's is the cursor, which the PC drew locally. The claim says so, and the
// note carries the absence statement.
test("terminal.cursorForm names the 1984 DIALOG demonstration and whose cursor the underline is", () => {
  const e = registry.get("terminal.cursorForm");
  expect(e.status).toBe("inferred");
  expect(e.claim).toBe("The input cursor is a blinking underline, taken from a 1984 television demonstration of a DIALOG search on an IBM PC. The underline is that PC program's, not DIALOG's: DIALOG sent characters, and the cursor was drawn by the searcher's terminal.");
  expect(e.claim).not.toMatch(/unrelated/);
  expect(e.note).toMatch(/Statement of absence/);
  expect(e.note).toMatch(/no DIALOG-issued manual from 1985 to 1997/);
});

// The claim names the editing operations and says Enter submits, which is the app's
// behaviour rather than the textarea's own.
test("terminal.line_editing is chosen and names what the browser's editing covers", () => {
  const e = registry.get("terminal.line_editing");
  expect(e.status).toBe("chosen");
  expect(e.claim).toBe("Typing uses the browser's own text editing: insert, backspace, arrows, paste. Enter submits the line. This is not a simulation of a period terminal's editing.");
});

// The entry carries a value, two period citations, and the narrowed statement of absence. A
// third citation, ALIN 1989, is not among them: the page image shows that figure is the speed
// of NAL's bulletin board, not DIALOG's.
test("terminal.pacing carries 120 cps, its sources, and the narrowed statement of absence", () => {
  const e = registry.get("terminal.pacing");
  expect(e.status).toBe("chosen");
  expect(e.value).toEqual({ bps: 1200, cps: 120 });
  expect((e.sources ?? []).map(s => s.sourceDate)).toEqual(["1984", "1988"]);
  expect(e.note).toMatch(/Statement of absence/);
  expect(e.note).toMatch(/89 ALIN OCR files/);
});

test("terminal.screen_rows is 24, inferred, with the claim naming the 1984 PC screen", () => {
  const e = registry.get("terminal.screen_rows");
  expect(e.value).toBe(24);
  expect(e.status).toBe("inferred");
  expect(e.claim).toBe("In screen mode only the last 24 lines are kept; 24 is inferred from a 1984 PC screen.");
});

test("terminal.display_mode is chosen: the reader picks what the period terminal decided", () => {
  const e = registry.get("terminal.display_mode");
  expect(e.status).toBe("chosen");
  expect(e.claim).toBe("The reader can choose among three ways output is kept and shown; in the period the terminal decided this.");
});

// packages/cris-formatb stays free of a runtime dependency on the registry: the reader
// package is shared with other workspace projects and must not import the app
// registry. It cites the keys its behavior is drawn from in comments instead of
// registry.get() calls. This test checks three sources of citation: registry.get() calls
// anywhere in src and packages/*/src, the comment-cited keys in packages/cris-formatb/src
// specifically, and the `registry: "..."` literals in src/dialog/map.ts (MAP entries name
// a key without ever calling registry.get() themselves -- describeLine resolves them).
test("every key referenced in source exists in the registry", () => {
  const calls = matchesIn([...tsFiles("src"), ...packageSrcDirs().flatMap(tsFiles)], /registry\.get\("([^"]+)"\)/g);

  const commentCited = matchesIn(tsFiles("packages/cris-formatb/src"), /Registry(?: keys)?:\s*([^\n*]+)/g)
    .flatMap(line => line.split(",").map(k => k.trim()).filter(Boolean));

  const mapCited = matchesIn(["src/dialog/map.ts"], /registry: "([^"]+)"/g);

  const used = [...calls, ...commentCited, ...mapCited];
  expect(used.length).toBeGreaterThan(10); // a broken scan must fail loudly, not pass on an empty set
  const known = new Set(registry.keys());
  expect(used.filter(k => !known.has(k))).toEqual([]);
});

// Every `sources[].source` is a short citation key, not a file location: the reader-facing
// citation lives in src/registry/words.ts and the panels print that, never the key. This
// check is the join -- a key the registry cites but words.ts cannot name would print
// nothing a reader could follow.
test("every registry source key resolves to a citation in words.ts", () => {
  let checked = 0;
  for (const k of registry.keys()) {
    for (const s of registry.get(k).sources ?? []) {
      checked++;
      expect(() => sourceName(s.source), `${k}: no citation for source key "${s.source}"`).not.toThrow();
      expect(sourceName(s.source).length, `${k}: empty citation for source key "${s.source}"`).toBeGreaterThan(0);
    }
  }
  expect(checked).toBeGreaterThan(10); // a broken scan must fail loudly, not pass on an empty set
});

// The forward check above proves every key USED in source exists in the
// registry; it says nothing about a registry key nothing reads. This reverse check scans the
// same source trees (src, packages/cris-formatb/src, scripts) for each known key's exact
// text, quoted (registry.get("key"), map.ts's registry: "key" literals, a citation array like
// panel.ts's `evidence: [...]`) or bare in a comment ("Registry keys: a, b, c"), and fails on
// a key found by neither -- except the few named here as deliberately declared but unread,
// each with a one-line reason.
const DECLARED_BUT_UNREAD: Record<string, string> = {
  "terminal.textColor": "no source records a color, so nothing in the sink can read one",
  "terminal.backgroundColor": "the same case as terminal.textColor: no source records a ground color either",
};

test("every registry key is referenced from source, or is named on the declared-but-unread allowlist", () => {
  const files = ["src", "packages/cris-formatb/src", "scripts"].flatMap(tsFiles);
  expect(files.length).toBeGreaterThan(10); // a broken scan must fail loudly, not pass on an empty set
  const quoted = /"([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+){1,4})"/g;
  const bare = /\b([a-z][a-z0-9_]*(?:\.[A-Za-z0-9_]+){1,4})\b/g;
  const known = new Set(registry.keys());
  const found = new Set<string>();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const re of [quoted, bare]) for (const m of text.matchAll(re)) if (known.has(m[1]!)) found.add(m[1]!);
  }
  const allowlist = new Set(Object.keys(DECLARED_BUT_UNREAD));
  const orphans = registry.keys().filter(k => !found.has(k) && !allowlist.has(k));
  expect(orphans, `registry keys referenced from no source file and not on the allowlist: ${orphans.join(", ")}`).toEqual([]);
  // The allowlist itself must not go stale: an entry that is actually referenced belongs in
  // source, not on this list.
  for (const k of allowlist) expect(found.has(k), `${k} is on the declared-but-unread allowlist but is referenced from source -- drop it`).toBe(false);
});

// nara.conversion.line_form once cited both nara-cris-packet and
// nara-tss-2018 with the same locator ("manifest, Record_Length 82"), so the inspect
// panel printed the same citation twice for one fact. Only NARA's 2018 technical
// specifications summary actually states "Record_Length: 82"; the CRIS documentation packet
// is a different document (the FY 1988 and FY 1991 validation statements plus the Format B
// element table) and never says it.
test("nara.conversion.line_form cites only the source that actually states Record_Length 82", () => {
  const e = registry.get("nara.conversion.line_form");
  const cited = (e.sources ?? []).map(s => s.source);
  expect(cited).toEqual(["nara-tss-2018"]);
});

// There are three statuses and no applicability axis; each source's own sourceDate carries
// the period instead.
const STATUSES = new Set(["documented", "inferred", "chosen"]);

test("every status is one of the three, and documented entries carry a source", () => {
  for (const k of registry.keys()) {
    const e = registry.get(k);
    expect(STATUSES.has(e.status), `${k}: status "${e.status}" is not one of the three`).toBe(true);
    if (e.status === "documented") expect(e.sources!.length, k).toBeGreaterThan(0);
  }
});

// proto.error.unknown_command, proto.error.unknown_field, and
// proto.error.bad_file's claims must describe what session.ts actually prints (offendingToken,
// session.ts ~49-56, and the error branches at ~79, ~91, ~103). Each test below checks the
// claim's own wording, then drives a real DialogSession to the printed output shape the wording
// describes.
describe("error claims match what session.ts prints", () => {
  const fixture = new Uint8Array(readFileSync("packages/cris-formatb/fixtures/fy94-9049442.bin"));
  const reader: RangeReader = { async read(o, l) { return fixture.subarray(o - 6810182, o - 6810182 + l); } };
  const offsets = { file: "RG164.CRIS.FY94.txt", sha256: "x", records: [["9049442", 83052, 83173] as [string, number, number]] };
  const indexes = { CY: { code: "CY", terms: { BELTSVILLE: [0] } } };
  const mk = (): DialogSession => new DialogSession(new RetrievalEngine(offsets, indexes, reader, "fy1991plus"), () => [{ text: "<record>" }]);

  test("proto.error.unknown_command: SELECT's first search term, TYPE's whole remainder, otherwise the first word", async () => {
    const e = registry.get("proto.error.unknown_command");
    expect(e.claim).toMatch(/first search term/);
    expect(e.claim).toMatch(/for a TYPE everything after the command word/);
    expect(e.claim).toMatch(/otherwise the first word/);
    const s = mk(); await s.submit("b 60");
    // OR itself now parses (proto.select.boolean); this SELECT still fails to parse because
    // its second operand carries a reserved character, and has no AND to split on, so the
    // "first search term" the claim names is the whole unparsed expression here -- pinned so
    // the claim's wording cannot drift from this printed shape.
    expect((await s.submit("s cy=beltsville or in=smith?")).map(l => l.text)).toEqual(["? CY=BELTSVILLE OR IN=SMITH?"]);
    expect((await s.submit("t 5")).map(l => l.text)).toEqual(["? 5"]);
    expect((await s.submit("zx cy=beltsville")).map(l => l.text)).toEqual(["? ZX"]);
  });

  test("proto.error.unknown_field: a question mark, the field and the term as typed, in capitals", async () => {
    const e = registry.get("proto.error.unknown_field");
    expect(e.claim).toMatch(/the field and the term as typed, in capitals/);
    const s = mk(); await s.submit("b 60");
    expect((await s.submit("s zz=x")).map(l => l.text)).toEqual(["? ZZ=X"]);
  });

  test("proto.error.bad_file names both conditions it is cited for: BEGIN of a file other than 60, and SELECT before any BEGIN", async () => {
    const e = registry.get("proto.error.bad_file");
    expect(e.claim).toMatch(/BEGIN named a file other than 60/);
    expect(e.claim).toMatch(/before any BEGIN/);
    const s = mk();
    expect((await s.submit("b 61")).map(l => l.text)).toEqual(["? 61"]);
    expect((await s.submit("s cy=beltsville")).map(l => l.text)).toEqual(["? CY=BELTSVILLE"]);
  });
});

// An entry that holds no value is the record of a gap, whatever its status: its claim is the
// only thing a reader gets, so it must say what is not held and what this reconstruction does
// instead. This covers every status, not just "chosen": an inferred entry with a null value
// is the same kind of gap.
test("an entry with a null value carries a claim, whatever its status", () => {
  let checked = 0;
  for (const k of registry.keys()) {
    const e = registry.get(k);
    if (e.value !== null) continue;
    checked++;
    expect(e.claim, `${k} has no claim`).toBeTruthy();
  }
  expect(checked).toBeGreaterThan(5); // a broken scan must fail loudly, not pass on an empty set
});

// The 28 February 1978 EPA session is the only File 60 session transcript held, and it is
// pre-anchor. It is added as a source on keys whose claim it actually bears on, never as a
// new behavior. It is a typeset reproduction: content is evidence, column positions are not.
const EPA_SOURCE = "epa-session-1978";
const citesEpa = (key: string) => (registry.get(key).sources ?? []).some(s => s.source === EPA_SOURCE);

test("the 1978 EPA session is cited by the keys it bears on", () => {
  for (const key of ["proto.begin.banner", "proto.begin.set_header", "dialog.file60.title", "proto.prompt"]) {
    expect(citesEpa(key), `${key} does not cite the 1978 EPA session`).toBe(true);
  }
  const epaSources = registry.keys()
    .flatMap(k => (registry.get(k).sources ?? []).map(s => ({ k, s })))
    .filter(({ s }) => s.source === EPA_SOURCE);
  for (const { k, s } of epaSources) {
    expect(s.sourceDate, `${k}: the 1978 session's sourceDate is the session date`).toBe("1978-02-28");
    expect(s.observedSystem, `${k}: the 1978 session was observed on File 60`).toBe("File 60");
    expect(s.locator, `${k}: a typeset reproduction cannot ground a column position`).not.toMatch(/column/i);
  }
});

// The banner's date-range form was recorded as unknown; 1978 shows one for File 60 itself.
test("proto.begin.banner records the 1978 date-range form and keeps 1990-1994 unknown", () => {
  const e = registry.get("proto.begin.banner");
  expect(e.status).toBe("inferred");
  expect(e.note).toMatch(/75-MAR78/);
  expect(e.note).toMatch(/not recorded for 1990-1994/);
});

// The 1978 set header carries an operator legend the 1984 and 1994 forms do not.
test("proto.begin.set_header keeps the 1978 variant as a recorded conflict, not as its value", () => {
  const e = registry.get("proto.begin.set_header");
  expect(e.value).toEqual(["      Set  Items  Description", "      ---  -----  -----------"]);
  expect(e.conflicts).toMatch(/\(\+=OR;\*=AND;-=NOT\)/);
});

// The typeset "? BEGIN 60" shows a space the fixed-pitch facsimiles do not; the compositor's
// spacing is not evidence, so this is a conflict, not a value change.
test("proto.prompt.spacing keeps its measured no-space value and records the 1978 typeset space", () => {
  const e = registry.get("proto.prompt.spacing");
  expect(e.value).toBe("");
  expect(e.conflicts).toMatch(/typeset/);
});
