# First research-session milestone (the acceptance session)

Question: Which FY 1994 records place a project at Beltsville with investigator
HAMMERSCHLAG F A, and how does this reconstruction render one of them under the
adopted File 60 rules?

Session:
  ? b 60
  ? s cy=beltsville                     → S1  669
  ? s s1 and in=hammerschlag  f a       → S2    2   (AN 9049442, 9146614)
  ? t s2/5/1                            → AN 9049442 in format 5
  inspect the typed record → offset 6810182, lines 83052–83173

Independent answer: fixtures/acceptance-fy94.json, produced by scripts/naive-split.py
on 2026-09-09. The set's AN list must equal the list there, not only its length.
Note: the investigator phrase carries two spaces, as stored.

Since the LOGOFF task, `? b 60` opens with the accounting stamp line
(`stamp()`, src/dialog/accounting.ts) before the blank line, banner, and set
header shown above; the acceptance session itself never issues `LOGOFF`, so
the printed accounting block is exercised separately, by
test/evidence/logoff.test.ts and test/regression/accounting.test.ts.

Re-derive it with `pnpm verify:acceptance`, which re-runs scripts/naive-split.py against
data/RG164.CRIS.FY94.txt and diffs its output against the committed fixture (outside
Vitest; the suite pins the script's sha256 instead of executing it, per
fixtures/SOURCES.md). The fixture's fourth field, `in_hammerschlag_f_a`, is the count
the session's IN per-term line is checked against.

## Run record, 2026-09-09 (first browser run)

`pnpm test` ran green (16 files, 58 tests) before this session and again after; a 59th test, for the reader CLI's scan subcommand, was added the same day.

Session run in a browser (Chrome, via browser automation) against `pnpm dev`
(Vite, `http://localhost:5173/`), typing into the textarea and reading the
rendered `<pre class="printout">` and `#inspect` panel directly. At the time
of this run, `DomSink` (`src/terminal/sink.ts`) and `mountInspect`
(`src/inspect/panel.ts`) carried no automated test -- `vitest.config.ts` set
`environment: "node"` with no DOM, and `grep -rl "DomSink\|mountInspect" test/
src/` found no test file among the matches. They were exercised by hand in
the browser on this date. **No longer true:** `test/regression/sink.dom.test.ts`
and `test/regression/inspect.dom.test.ts` (both `@vitest-environment happy-dom`)
now cover `DomSink` and `mountInspect` directly, and the run record after the
inspect-panel rewording, below, drives both through a real happy-dom document
instead of only by hand in a browser.

S1 line as printed:
```
      S1     669  CY=BELTSVILLE
```

S2 lines as printed (per-term postings line, then the set line):
```
               2  IN=HAMMERSCHLAG  F A
      S2       2  S1 AND IN=HAMMERSCHLAG  F A
```

`T S2/5/1` typed AN `09049442`; typing `T S2/5/2` (beyond the required session,
to confirm the second item) typed AN `09146614`. S2's AN list, in ascending
file order: `9049442`, `9146614`. Equal to
`cy_beltsville_and_in_hammerschlag_f_a.an` in `fixtures/acceptance-fy94.json`.

Inspect result for the PROJ NO line (`T S2/5/1`, AN 9049442), clicked in the
browser -- the inspect panel's own text, elided at the sha256 and with the
byte-range en dash normalized to a hyphen:

```
CRIS source (Format B)
PN line 83058, byte 6810674: 1275-21000-008-00D
AS line 83056, byte 6810510: ARS
DS line 83057, byte 6810592: 1275
Archival source
RG164.CRIS.FY94.txt (NAID 1204533), lines 83052-83173, bytes 6810182-6820185, ...
```

The DS value is the one behind `AGENCY : ARS 1275`, tag `DS`, raw `1275`,
line 83057, byte offset 6810592, matching `field(rec, "DS").offset` in
`packages/cris-formatb/src/record.ts`. The record's archival span is lines
83052-83173, byte offset 6810182, length 10004, matching the session line
above.

`dd` confirmation, independent of the application, run against the live
corpus (`data/RG164.CRIS.FY94.txt`, not committed):
```
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83051 count=1
$$
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83052 count=1
AN 9049442
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83056 count=1
DS 1275
```
Line 83052 (0-indexed skip 83051) opens the record with `$$`; line 83053
carries `AN 9049442`; line 83057 carries `DS 1275`. This confirms, from the
raw bytes independent of the parser, that the byte offsets the app and the
inspect panel report for this record are the archive's own.

## Run record, 2026-09-09 (after the workspace-config change)

`pnpm test` before this session's fix: 26 test files, 115 tests, green,
with a deprecation warning on `vitest.workspace.ts`, since removed. After
the workspace-config, `pnpm typecheck` and README not-implemented-list
changes: 30 test files, 119 tests, green,
no deprecation warning. `pnpm exec tsc --noEmit` clean for the root project
and for `packages/cris-formatb`.

Re-running the session in a browser (Chrome, via browser automation, the
same method as the first browser run) against `pnpm dev` found the app did not
mount at all: `main#terminal` was empty, no textarea, no error visible on
the page. `import('/src/app/main.ts')` in the browser console surfaced the
cause: `src/loader/build.ts`, which `src/app/main.ts` imports for
`indexUrls`/`Offsets`/`Index` (imported from one place so the field list is
not duplicated), also statically imported
`node:fs` and `node:crypto` for its own CLI block. Vite externalizes node
builtins for the browser bundle; importing a named binding from an
externalized module throws immediately on module evaluation, before any
guard on `process.argv` is reached, so the whole module -- and everything
that imports it -- failed silently from the app's point of view. No
automated test caught this because Vitest's `node` test environment runs
real `node:fs`/`node:crypto`, not Vite's browser externalization.

Fixed by splitting `src/loader/build.ts` into three: `build.ts` keeps only
the browser-safe surface (types, `PHRASE_FIELDS`, `indexUrl(s)`,
`phraseKey`); `src/loader/index-builder.ts` holds `buildIndexes` (needs
`node:crypto`); `src/loader/cli.ts` is the `pnpm load` entry point (needs
`node:fs`). A regression test
(`test/regression/loader-build-browser-safe.test.ts`) pins `build.ts`
against any static `node:*` import (not just `node:fs`) so reintroducing
either half of the original bug cannot recur silently.
`public/corpus` was rebuilt (`pnpm load`) and the archival suite re-run
against it; same counts as before the fix: 34,090 records, 0
composite/GC/SC-SN mismatches, 0 bad lines, 0 orphan continuations.

With the fix in place, the full acceptance session ran end to end in the
browser: `B 60`, `S CY=BELTSVILLE` (S1 669), `S S1 AND IN=HAMMERSCHLAG  F
A` (S2 2, per-term postings line 2), `T S2/5/1` (AN 09049442, format 5,
full record text matching the first browser run byte for byte), `T S2/5/2` (AN
09146614, confirming the second item). S2's AN list, in ascending file
order, `9049442`, `9146614`, equals
`cy_beltsville_and_in_hammerschlag_f_a.an` in
`fixtures/acceptance-fy94.json`.

Clicking the PROJ NO line (`data-ordinal="836"`, `data-tags="PN,AS,DS"`,
`data-keys="map.PN,map.AS,map.DS"` -- three separate per-tag registry
keys, not one shared `map.DS`) opened
the inspect panel with the CRIS source, archival source, tape provenance,
and transformation evidence cards, matching the first browser run's content for
this record. `fetch('/corpus/RG164.CRIS.FY94.txt', {headers: {Range:
'bytes=6810182-6810263'}})` from the page itself returned HTTP 206,
`Content-Range: bytes 6810182-6810263/277539004`, body starting `$$`,
confirming the byte range independent of the inspect panel's own display.

`dd` confirmation, independent of the application, re-run against the live
corpus:
```
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83051 count=1
$$
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83052 count=1
AN 9049442
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83056 count=1
DS 1275
$ shasum -a 256 data/RG164.CRIS.FY94.txt
437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a
```
The sha256 matches `offsets.json`'s `sha256` field and the inspect panel's
own displayed hash, unchanged from the first browser run despite the `pnpm load`
rebuild in between (the corpus bytes did not change; only the loader code
that reads them did).

## Run record, 2026-09-09 (after the inspect-panel rewording)

`pnpm test` ran green (35 files, 173 tests) and `pnpm typecheck` was clean
before this run record was written. Session driven end to end against the
real corpus in a standalone happy-dom harness (not a Vitest test -- built
`RetrievalEngine` over `buildIndexes(data/RG164.CRIS.FY94.txt, ...)`,
`FsRangeReader`, `DialogSession`, `DomSink`, and `mountInspect` directly,
the same modules `src/app/main.ts` wires, in a real `happy-dom` `Window`),
rather than only by hand in a browser -- the current five-card inspect
panel had no run record of its own; the two records above name an earlier
four-card panel and, in the first, no automated DOM test at all.

Session output, `B 60` / `S CY=BELTSVILLE` / `S S1 AND IN=HAMMERSCHLAG  F
A` / `T S2/5/1`, matches the two earlier runs byte for byte:
```
      S1     669  CY=BELTSVILLE
               2  IN=HAMMERSCHLAG  F A
      S2       2  S1 AND IN=HAMMERSCHLAG  F A
```
followed by the full format 5 render of AN 09049442 (identical to
`fixtures/fy94-9049442.format5.txt`).

Clicking the PROJ NO line (`data-ordinal="836"`, `data-tags="PN,AS,DS"`,
`data-keys="map.PN,map.AS,map.DS"`, same as the run after the
workspace-config change) opened the
inspect panel. Its five cards, in order: "What was printed", "How DIALOG
names it", "The bytes in the NARA file", "Where the file came from", "Why
it prints this way" (matching `registry.get("inspect.mode").value` and
`test/regression/inspect.dom.test.ts`'s `FIVE_TITLES`).

"The bytes in the NARA file" card's per-field offsets for this line (line
number, byte offset -- `(line - 1) * 82`, confirmed independently below):
```
PN 1275-21000-008-00D  --  line 83,058, byte 6,810,674
AS ARS                 --  line 83,056, byte 6,810,510
DS 1275                --  line 83,057, byte 6,810,592
```
plus the record-level sentence: NAID 1204533, lines 83,052-83,173 (10,004
bytes), FY 1991-and-later encoding profile, corpus sha256
`437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a` -- the
corpus hash, now on the card (the `offsets` argument carrying it had
previously been passed in and never read).

Range confirmation, independent of the inspect panel's own display: with
`pnpm dev` running, `curl -D - -H "Range: bytes=6810182-6810263"
http://localhost:5173/corpus/RG164.CRIS.FY94.txt` returned
```
HTTP/1.1 206 Partial Content
Content-Range: bytes 6810182-6810263/277539004
```
with a body beginning `$$` (checked as raw bytes, `od -c`).

`dd` confirmation, independent of the application, re-run against the live
corpus:
```
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83051 count=1
$$
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83052 count=1
AN 9049442
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83055 count=1
AS ARS
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83056 count=1
DS 1275
$ dd if=data/RG164.CRIS.FY94.txt bs=82 skip=83057 count=1
PN 1275-21000-008-00D
$ shasum -a 256 data/RG164.CRIS.FY94.txt
437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a
```
`dd`'s 0-indexed `skip` is the app's 1-based line number minus one, so
`skip=83055` reads line 83,056 (AS), `skip=83056` reads line 83,057 (DS),
and `skip=83057` reads line 83,058 (PN) -- all three match the inspect
panel's own reported lines and, by `(line - 1) * 82`, its byte offsets.
The sha256 matches `offsets.json`, the inspect panel's displayed hash, and
`registry.get("nara.file.fy1994_fixity").value.sha256`, unchanged since the
first browser run.

## Run record, 2026-09-10 (extended session: EXPAND, SS with OR, DS, LOGOFF)

Extended the recorded session (`casts/first-session.cast`, `scripts/cast.ts`) past the
original four-command acceptance question to show more of what this reconstruction now does:

```
? b 60
? e in=hammerschlag                    → EXPAND window; entered form absent, E4 HAMMERSCHLAG  F A present, 2 postings
? ss cy=beltsville or cy=greenbelt     → S1  669  S2    0  S3  669
? s s3 and in=hammerschlag  f a        → S4    2
? ds                                    → all four set lines
? t s4/5/1                             → AN 9049442 in format 5
? logoff                                → 1 Types in Format 5, 0.007 Hrs File60
```

Each count reproduces a fixture value from `fixtures/acceptance-fy94.json`, derived by
`scripts/naive-split.py`, not by the loader: `cy_beltsville` 669, `cy_greenbelt` 0 (added this
session; no record in this corpus carries CY=GREENBELT, the same absence already recorded for
`cy_beltsville_or_greenbelt`, now checkable on its own operand), `cy_beltsville_or_greenbelt`
669, `cy_beltsville_and_in_hammerschlag_f_a` 2, `in_hammerschlag_f_a` 2 (the S4 per-term
posting). `T S4/5/1` types AN 09049442, matching every earlier run record's format 5 text
byte for byte. `pnpm verify:acceptance` reran clean after adding `cy_greenbelt`; the script's
new sha256 is recorded in `fixtures/SOURCES.md`.

The LOGOFF block's connect time, 0.007 Hrs, is unchanged from the four-command session's own
LOGOFF: the cast clock (`scripts/cast.ts`) only advances on session construction, BEGIN's
stamp, and LOGOFF's stamp -- `src/dialog/session.ts` never reads it for SELECT, SELECT STEPS,
EXPAND, DISPLAY SETS, or TYPE -- so the 24-second BEGIN-to-LOGOFF span holds regardless of how
many commands run between them.

`test/archival/cast-session.test.ts` was extended to assert the S1-S4 set lines above, the
LOGOFF Types count, and the connect time against the rebuilt cast, in addition to the AN
9049442 line it already checked. `pnpm test` ran green (54 files, 324 tests) and `pnpm
typecheck` was clean after this session's changes, including the regenerated
`casts/first-session.cast` and `casts/first-session.poster.txt` (`pnpm cast && pnpm poster`).

## Run record, 2026-09-11 (Task 8, proximity operators)

Chosen term pair for the independent proximity check: `FRESH(W)WATER/TI` over the real corpus.
Several candidate pairs were checked by hand against `data/RG164.CRIS.FY94.txt` before choosing
one -- a zero count proves nothing, since it could be absence of data rather than absence of the
feature: `GENE/TRANSFER` 39, `TISSUE/CULTURE` 66, `SOIL/EROSION` 47, `DAIRY/CATTLE` 181,
`PEACH/TREE` 9, `WATER/QUALITY` 369, `PLANT/GROWTH` 74, `DISEASE/RESISTANCE` 119,
`FRESH/WATER` **2**, `SWEET/POTATO` 41, `INTEGRATED/PEST` 81, `PEST/MANAGEMENT` 256.
`FRESH(W)WATER` was chosen: small (so the AN list is easy to read and check by hand) but real --
AN 9135868 and 9145616 (two records). Added to
`scripts/naive-split.py` as `ti_fresh_w_water` (a fresh `prox_w` position-aware check, no code
shared with the loader or the engine) and to `fixtures/acceptance-fy94.json`; the script's new
sha256 is recorded in `fixtures/SOURCES.md`. `test/archival/proximity-corpus.test.ts` runs
`S FRESH(W)WATER/TI` end to end through `DialogSession` against the real corpus and the prebuilt
positional shards under `public/corpus/pos`, and asserts the resulting set's AN list equals
`ti_fresh_w_water.an` exactly, not only its length.

Curso p. 99 (printed 113) of `ERIC_ED374805_Curso_Introductorio_DIALOG_1994.pdf` was rendered at
200 dpi and read: legible, and useful -- a 1994 SS session (File 49, Pais Int., not File 60, but
the same DIALOG SELECT/SS mechanics) shows `TECHNOLOG?(W)TRANSFER?/TI` and
`TECHNOLOG?(1N)TRANSFER?/TI`, confirming the single-trailing-suffix-shared-by-both-operands rule
and the per-operand-then-combined SS printing shape with an anchor-period (1994) source, moving
`proto.select.proximity.perterm` off a 2001-only bracket.

`pnpm test`, `pnpm typecheck`, and `pnpm verify:acceptance` all ran clean after this session's
changes.

## Run record, 2026-09-11 (Task 11 closeout: truncation, SORT, RANK answer sets)

Four more answer sets this plan derived, each in `fixtures/acceptance-fy94.json`, each checked
against an independently-run `scripts/naive-split.py`, never against the code under test.

**Truncation.** Question: which records does `S TECHNOLOG?/TI` retrieve, and how many CY values
start with BELTSVILL? Command: `B 60` then `S TECHNOLOG?/TI` (`ti_technolog`, 539 records, checked
end to end through `DialogSession`) and, for the phrase-field prefix form this task's SELECT
grammar does not parse (`CY=BELTSVILL?`), `RetrievalEngine.prefixPostings("CY", "BELTSVILL")`
directly (`cy_beltsvill_trunc`, 669 records -- every CY=BELTSVILLE record, since no other CY value
in this corpus starts with BELTSVILL). `test/archival/truncation-corpus.test.ts`.

**SORT by PN.** Question: in what order does `SORT S1/ALL/PN` reorder the 669 CY=BELTSVILLE
records? Command: `B 60`, `S CY=BELTSVILLE`, `SORT S1/ALL/PN` (`cy_beltsville_sorted_by_pn`, an
*ordered* 669-AN list, ties on AN -- not resorted for comparison, checked item by item against
`session.sets[1].ordinals` in stored order). `test/archival/sort-corpus.test.ts`.

**SORT by a multi-valued field.** Question: with 312 of those 669 records carrying more than one
IN value, does `SORT S1/ALL/IN` use each record's alphabetically-first IN value (`proto.sort.
multivalue_key`), or does it depend on index-insertion order? Command: `B 60`, `S CY=BELTSVILLE`,
`SORT S1/ALL/IN` (`cy_beltsville_sorted_by_in`, an ordered 669-AN list derived by
`min()` of each record's own IN values, ties on AN). This is the one archival case able to
distinguish the fixed rule from the pre-fix bug, since PN never repeats within a record.
`test/archival/sort-corpus.test.ts`.

**RANK.** Question: ranking ST over the 669 CY=BELTSVILLE records, what terms and counts does
RANK tally? Command: `B 60`, `S CY=BELTSVILLE`, `RANK ST` (`rank_st_over_cy_beltsville`, a
`[term, count]` list, derived by an independent `Counter` over the same set, sorted count
descending then term ascending -- the same order `rankTally` produces, with no code shared).
Checked against `RetrievalEngine.rankValues`'s own tally, not against the printed block's column
layout (`proto.rank.columns` is this reconstruction's own choice, not evidence). Every
CY=BELTSVILLE record's ST is MARYLAND, so the fixture is the single row `[["MARYLAND", 669]]` --
small, but real, and it still exercises the tally-and-tie-break path end to end.
`test/archival/rank-corpus.test.ts`.

`pnpm test`, `pnpm typecheck`, and `pnpm verify:acceptance` all ran clean after this session's
changes.
