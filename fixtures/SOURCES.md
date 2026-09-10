# Fixture sources

1994-curso-pais.txt: transcribed by eye 2026-09-09 from *Curso Introductorio sobre el
Sistema DIALOG*, 1994 (ERIC ED374805), PDF page 99 (printed page 113: "Uso de los operadores de proximidad (W), (), Y (N)").
This is a fixed-pitch computer printout page, not the typeset SS teaching illustration
that also carries a page number "113" in a different sense (PDF page 113, printed page
130 — see registry key proto.select.echo_case for that distinction). Confirmed a fixed-
pitch printout by rendering the page (`pdftoppm -r 400 -f 99 -l 99 -png`) and inspecting
the glyphs directly: monospaced font, a page-bottom footer reading "113", and terminal-
session content (`?b 49`, a File banner, a Set/Items/Description header with a dashed
rule, a `?ss` command, and three set lines) consistent with the other fixed-pitch pages
already cited in the registry (114/131, 117/136, 126).

Column positions measured against the 400 dpi render (ink bounding boxes per character,
calibrated against the "File  49:" line's known column-7 field, pitch ~39.4-39.6 px):
Set starts at column 7, Items at column 12, Description at column 19. Used to correct
registry key proto.begin.set_header (see registry/evidence.json decision field on that
key).

Set-line row measurement (S1/S2/S3, same calibration): "S1"/"S2"/"S3" start at column 7.
Item counts are right-aligned ending at column 16: S1's "4322" occupies columns 13-16,
S2's "1330" columns 13-16, S3's "252" columns 14-16 (3 digits, same right edge). The
description starts at column 19 on all three lines ("T" of "TECHNOLOG?" and "TRANSFER?"),
matching the header's Description column. This corrects registry key
render.setline.columns' itemsEnd from 17 to 16 (see decision field on that key); setCol 7
and descCol 19 are confirmed unchanged.

## bluesheet-sample-1998.txt

Transcribed 2026-09-09 from the SAMPLE RECORD table's `<td>` cells in the DIALOG Blue
Sheet for File 60, 2 March 1998, as published (Wayback capture of 23 April 1998), not from
the lynx rendering of the same page. `&nbsp;` decoded to a plain space
character (both stayed width-1 in every measurement below; the source HTML mixes literal
spaces and `&nbsp;` within a run of consecutive spaces, apparently only to defeat HTML's
whitespace collapsing, not to distinguish two kinds of space).

Rights: the Blue Sheet is DIALOG's published documentation of the database.
This file transcribes one sample record and its field table, a small excerpt
held for line-by-line comparison with this reconstruction's output, and
nothing else from the page.

**Method:** parsed the table's rows with a regex over the raw Latin-1 bytes
(`<tr><th...>label</th><td...><tt>content</tt></td></tr>`), decoded HTML entities, and
measured each row's content against the raw HTML alone, with no reference to render5()'s
output. Every `<td>` cell holds exactly one leading literal space and one trailing `&nbsp;`
around its real content, except two cells — the first header line
("` DIALOG(R)File  60:CRIS/USDA`") and the AN= line ("` 09089306`") — whose raw HTML holds
only a single literal space with no `&nbsp;` following it before the content starts. For
those two lines, that one space is real content (it matches the leading space already on
record in registry key render.type.header, sourced from this same table, and the leading
space in the given render5.test.ts/render5-9049442.test.ts fixed-form assertions for AN=),
not an HTML-whitespace-collapse artifact, so it is kept. Every other line has the cell drop
its one leading literal artifact space and its one trailing `&nbsp;` artifact, keeping
everything in between (including any further `&nbsp;`-based indentation, which is real
content, e.g. the grid and SPECIAL CLASSIFICATION rows' extra indent). This is a single
uniform rule with exactly two named exceptions, not a per-line judgment call.

Per-block deltas between the sample (measured this way) and render5()'s earlier literals.
A second, independent parse of the same `<td>` cells on 2026-09-09 produced the same
numbers; all six are now measured columns in render5.ts and in both tests' pinned strings,
and are ordinary fixture content rather than `# unreproduced` markers.

- Grid header and all four grid rows: sample indents 8 spaces; render5()'s literal (pinned
  by both given fixed-form tests, including the archival one on AN 9049442) used 10.
  **Corrected to 8** — the archival test's pin was itself wrong, not a constraint to
  preserve; re-pinning it to the measured column is a correction, not a weakening.
- The "GENERAL" line: sample has 49 leading spaces; render5()'s literal had 50.
  **Corrected to 49.**
- The "PRIMARY CLASSIFICATION ... CLASSIFICATION" line: sample has 14 leading spaces;
  render5()'s literal had 15. **Corrected to 14.**
- The four SPECIAL CLASSIFICATION rows (XHMR, S2540, S2550, S3110): sample indents 9
  spaces; render5()'s literal (the S2540 row is pinned by the given fixed-form test) used
  10, with the code and label padded as two separate fields (`pad(code,8)` +
  `pad(label,42)`), which placed the XHMR row's one extra pad space one column off (both
  forms were 54 characters total, but XHMR's percent landed one column early). **Corrected**
  to 9 leading spaces with the code and label rendered as one field, `` `${code}   ${label}`
  ``, padded to 50 columns — this reproduces all four rows exactly, including XHMR, because
  the sample's code-label gap is a fixed 3 spaces regardless of code length (4 or 5
  characters), not a fixed code-field width. The percent lands at column 59 (9 + 50) on
  every row.
- The PROGRESS line: sample indents `PROGRESS:` 2 spaces, like the OBJECTIVES/APPROACH/
  KEYWORDS label lines; render5()'s literal (pinned by the given fixed-form test) used 1.
  **Corrected to 2.**
- The sample's SH= (PRIMARY/GENERAL HEADINGS) lines separate a code from its label with a
  stray non-`&nbsp;` byte (0xA6, "¦" under Latin-1) for the *first* pair on the PRIMARY
  HEADINGS line, and with a doubled space for every later pair on both PH= and GH= lines;
  render5()'s render.headings.join uses a single space throughout. PH's word-wrap breaks
  after that point also differ from this milestone's greedy-fill algorithm. **Left
  unreproduced** — the greedy-fill/single-space-join algorithm genuinely cannot produce
  these without a different join rule and a different wrap rule, both out of scope here.

The pre-correction deltas were not uniform in direction: the grid, the two
classification-header literals, and the SC rows had render5() indenting *more* than the
sample; PROGRESS had render5() indenting *less*. render.format5.layout's decision field
records the corrected list directly rather than a single directional generalization.

justify-width measurement: over the OB, AP, DE and PR cells, after removing exactly the
indent render5()'s own code adds to each row (1 leading space for continuation rows and for
every /PR row, which gets no separate label treatment; 2 leading spaces for the label row of
an OB/AP/DE textBlock() call), every full-justified continuation line is 65 characters; the
widest line of all is the APPROACH label row at 66. Both figures are narrower than the 69
previously on record.

Measured 2026-09-09: width 65, with TI's wrap called at that width directly (not
width - 1, the arithmetic that had been the stated reason for keeping 69). Ran render5.ts's own justify() in isolation against the sample's TI text and
its OB/AP/PR narrative (words collapsed to single spaces, since the sample's visible
multi-space runs are the full-justify stretching itself, then re-wrapped by the algorithm
under test). Result: TI's break reproduces the sample's exactly at width 65 ("...DESIGNED
TO" / "MODIFY LIPID METABOLISM"), and so do all 24 of PR's continuation lines and all but
the first row of OB's and AP's — the two mismatches are the OBJECTIVES: and APPROACH: label
rows themselves (63 and 66 characters, not 65), because textBlock() glues the label into the
same word list that gets stretched, so its trailing space is treated as an ordinary
justified gap where the sample keeps it single; a pre-existing property of textBlock(),
unrelated to the width value, present at any width, and out of scope here since none of
OB/AP/DE/PB/PR is exercised by either given test. render.text.justify's stored width is now
65, with TI's call decoupled from width - 1 to width.

OB=/AP=/DE=/PB=/PR= (OBJECTIVES/APPROACH/KEYWORDS/PUBLICATIONS/PROGRESS narrative) are
transcribed into the fixture in source order as `# not-exercised` comments, carrying the
sample's real text — the given synthetic LogicalRecord does not populate these fields,
so render5() emits no line for them regardless of correctness. Checked directly: none of
these lines, including the several that contain `(p<0.05)` etc. mid-line, end with `(p`.

Other findings, recorded as `# unreproduced` notes in the fixture rather than as changes to
the given render5.ts/render5.test.ts code:

- SP= (Sponsor Code) is HNRIMS-only per footnote 3 on the Additional Indexes table, the
  same status as the five fields omitted above; the sample's
  PN=/AS=/DS=/SP= line and SF= (SUBFILE) line each carry a trailing segment attributable to
  HNRIMS membership, dropped from the fixture's CRIS-only reconstruction of those two lines.

## scripts/naive-split.py (independence check)

An earlier version of `values()` treated a 0xAC continuation byte as more text appended to
the value already open, rather than as the start of a separate value -- the opposite of
registry key `formatb.encoding.continuation_0xAC`. It happened to pass every acceptance
check because none of AN, CY, or IN ever carries a 0xAC continuation in this corpus, so the
bug was invisible to the three counts the script exercised, but it meant the script could
not be trusted to check any field that does repeat with a continuation. A 0xAC-marked
continuation line now starts a new value (`cur = bytearray(d[1:]); out.append(cur)`)
instead of extending the current one. Re-ran `python3 scripts/naive-split.py
data/RG164.CRIS.FY94.txt` against the corpus after the fix: `records` (34,090),
`cy_beltsville` (669), and `cy_beltsville_and_in_hammerschlag_f_a` (2, AN 9049442 and
9146614) are unchanged -- the fix does not touch any value these three counts depend on.
Added a fourth field, `in_hammerschlag_f_a` (count and AN list for IN=HAMMERSCHLAG F A
regardless of CY, an independent query DialogSession's own postings count did not
previously have anything but itself to check against): count 2, AN 9049442 and 9146614 --
the same two records, so in this corpus nobody named HAMMERSCHLAG F A works outside
Beltsville.

Added a fifth field, `ti_peach` (count and AN list for TI text containing the token PEACH,
checking S PEACH/TI's word-index result against a tokenizer written fresh inside the script
rather than imported from src/loader/words.ts): count 60. Re-ran `python3
scripts/naive-split.py data/RG164.CRIS.FY94.txt` against the corpus after adding it: the
first four fields (`records`, `cy_beltsville`, `cy_beltsville_and_in_hammerschlag_f_a`,
`in_hammerschlag_f_a`) are byte-for-byte unchanged.

Added a sixth and seventh field for OR and NOT, checking `RetrievalEngine`'s union and
difference against a set union/subtraction written fresh over the raw values rather than
through the engine's own index lookup: `cy_beltsville_or_greenbelt` (AN list for CY=BELTSVILLE
union CY=GREENBELT) and `cy_beltsville_not_st_maryland` (AN list for CY=BELTSVILLE minus any
record whose ST also carries MARYLAND). Re-ran `python3 scripts/naive-split.py
data/RG164.CRIS.FY94.txt` against the corpus after adding them: the first five fields are
byte-for-byte unchanged. No record in this corpus carries CY=GREENBELT, so
`cy_beltsville_or_greenbelt`'s 669 AN list is identical to `cy_beltsville`'s own; every
CY=BELTSVILLE record in this corpus also carries ST=MARYLAND, so `cy_beltsville_not_st_maryland`
is an empty list -- both are the corpus's own answer, not a simplified test case chosen to make
the check easy.

## The corpus's own trailer line

The last 82-byte line of `data/RG164.CRIS.FY94.txt` is
`>> 003384620000034090` (padded with spaces to 80 columns, then CRLF):
NARA's own declared data-line count, 3,384,620, at trailer columns 4-12
(`trailer.slice(3, 12)`), and its own declared record count, 34,090, at
columns 13-21 (`trailer.slice(12, 21)`). Both this loader and
`scripts/naive-split.py` derive their record counts by splitting on the
same `$$` marker, so their agreement with each other says nothing about
whether that marker is the right one to split on; the trailer is read
directly from the file's own accounting and does not share that
assumption. `test/archival/loader.test.ts`'s full-corpus test asserts
both figures against the parsed count.

sha256: 7b27fd59664999eb1a86b4e1bb6c5bad36e0de5c1306bfa7a79b312fd484e98c

Not re-run by the automated suite: no subprocess is spawned from inside a Vitest test (an
`npx tsx` subprocess spawn from a Vitest worker had
previously deadlocked the parallel run -- test/regression/readme-registry.test.ts's comment).
test/archival/naive-rederive.test.ts pins this hash and the import list statically instead of
executing the script. `pnpm verify:acceptance` runs the command above and diffs its output
against the committed `fixtures/acceptance-fy94.json` (outside Vitest, by hand or in a
non-Vitest CI step) -- run it, and update both this hash and the fixture together, whenever
the script or the corpus changes.

## casts/first-session.cast

Generated 2026-09-09 by `pnpm cast` (`scripts/cast.ts`) against the real corpus
(`data/RG164.CRIS.FY94.txt`, sha256
`437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a`, matching
`public/corpus/offsets.json` and every prior run record in this file). Not a
capture of any live session -- built directly from `DialogSession`'s own
output for the acceptance session's four commands, plus the reconstruction
statement, via `src/cast/asciicast.ts`'s `buildCast`. Derived entirely from
committed code plus the archival file; not re-run by the automated suite
(archival tests read `DialogSession`'s output directly, not this file --
test/archival/cast-session.test.ts calls `buildFirstSessionCast()` itself
rather than parsing the committed artifact).

The header's `timestamp` field is `pnpm cast`'s own run time
(`Math.floor(Date.now() / 1000)`, `src/cast/asciicast.ts`), so the file's
hash changes on every re-run even when nothing else has: this is a property
of the timestamp field, not a sign of drift. Re-run `pnpm cast` and update
this hash only when the corpus, the registry, the DIALOG layer, or
`cast.pacing` actually changes.

sha256: 8b33e9d13151fa54cdbfacc610aa99094649610a53899c501e0e85aa125fa8f3
