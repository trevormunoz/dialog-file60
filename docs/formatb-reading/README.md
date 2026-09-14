# Format B: first whole-record reading

## Purpose and status

Agreed purpose: a humanistic second reading through a different discipline
of articulation. Does Gleam's pressure to name and follow through distinctions
illuminate Format B, or primarily reflect Gleam? New evidence-grounded questions
can count as success without replacing the TypeScript parser.

## Agreed design

**Types state what the format asserts can be true; construction makes us deal
with places where the supplied data does not confirm those assertions.**

1. Retain the supplied bytes and ordered field occurrences independently.
2. Model a prescribed project, with required fields and documented optionality,
   repetition and value constraints. Omission permitted by a rule is not the
   same thing as a failed reading.
3. Use opaque types and smart constructors for constrained values. The first
   implemented example is `src/accession.gleam`: exactly seven ASCII digits,
   retained verbatim as bytes, with no trimming, repair or loss of leading zeroes.
4. Construct a Project only after checking the selected documentary rules.
   Return a Result with typed, source-linked problems on failure. Accumulate
   independent problems rather than stop at the first field; checks depending
   on an invalid value must not manufacture additional conclusions.
5. Each disagreement names the documentary assertion, our interpretation of it,
   its applicable stage, the examined source span, and the method. A required
   field not located is a provisional, scoped statement of absence.
6. Unresolved rules and not-yet-modeled fields block construction too, but are
   distinct from evidence of nonconformance. Neither becomes a permissive
   `remaining` slot inside a successfully constructed project.
7. Keep supplied and DIALOG-loaded stages distinct. Do not enforce a rule about
   service-generated UD against the submitted bytes.

An Error means **the witness did not satisfy this stated reading**, not that
historical data is wrong. Investigate the data, interpretation, documentary
version and scope before revising either the rules or the reading. Successful
construction likewise certifies only the selected rules, not historical truth.

### Implementation status

`src/record_model.gleam` revises the whole-example model around this design. The
permissive `Reading(...)` slots are removed. Project is opaque; its public
construction path is `build_project`, a smart constructor that performs no
checking itself — `construct.project` calls it only after every group/field
has been independently checked and found problem-free, so the checking
discipline stays in `construct`, not in the model. Required AN, PN, TI, IN and
SF are no longer optional. PS is modelled as `Provisional`: its requiredness
rests only on a handwritten amendment on PDF p. 13 — the ENTIRE PS row is a
handwritten insertion, not merely an amendment to a printed row — a weaker
`EvidenceGrade` than the printed rows, so a missing PS is a scoped provisional
situation to record rather than a hard nonconformance, and no length is
enforced on it either. Whether that annotation applies remains to settle.

Accession lexical construction: the checks live in
`test/accession_test.gleam` (gleeunit): valid values, preserved zeroes, invalid
lengths, non-digits, whitespace, and the byte-versus-character boundary.

Card-image field extraction: `src/card_image.gleam` `data_value` takes one
served card line's bytes and returns columns 4-72 with the trailing pad dropped,
or `LineTooShort` when the line stops before column 72. The pad is the card
blank, ASCII space (0x20), and only that byte is dropped: a stray non-space
trailing byte (a tab, a bare CR) is kept so a later field check sees it rather
than have it silently repaired, and columns 73-80 are never read. This is the
step that produces the `BitArray` `accession.parse` and the future section
constructors validate.

Line classification: `card_image.gleam` `classify` reads columns 1-2 and
returns a `LineKind`: `SeparatorLine` ("$$"), `ContinuationLine` (blank tag
"  "), or `TaggedLine(tag)` (any other two bytes). It reads only the tag
columns; value extraction stays in `data_value`. A continuation whose first
data byte is a profile marker (0xAC in this record) is a marked value rather
than wrapped text; `continuation_kind` makes that distinction separately, so
`classify` reports both as `ContinuationLine`. File-structure lines ("<<"
header, ">>" trailer) are `scan.scan`'s concern, not `classify`'s.

Line splitting: `card_image.gleam` `split_lines` chops a record's bytes into
fixed 82-byte served lines in order. The width is structural, so a byte count
that is not a whole number of lines is a typed `LengthNotLineAligned` rather
than a silently dropped tail; per-line CRLF is a separate data-quality check,
not enforced here.

Continuation kind: `card_image.gleam` `continuation_kind` reads whether a
continuation line is `Wrapped` (appends to the value above it) or `Marked` (its
column-4 byte is the profile marker, opening a new value) — the model's
`Fragment.WrappedText` versus `Fragment.MarkedValueStart`. The marker is passed
in (0xAC for this FY94 record, per the registry, not hardcoded), keeping
`classify` profile-free.

`test/card_image_test.gleam` covers these functions with example lines,
deterministic property-style generators (value lengths 0-69, the short-line
range 0-71, every A-Z two-letter tag, 0-40-line records, and every column-4 byte
0-255 against the marker), and lines copied byte for byte from the fixture (AN,
PN, the "$$" separator, and both a wrapped and a marked continuation). Run all
tests with `gleam test` from this directory.

Assembly: `src/assembly.gleam` walks a record's lines into the model's own
types. `line_location` gives a line's file-absolute `Location` from a
`SourceBase`; `line_role` interprets one line as opening a field, continuing
one (wrapped or marked), or the "$$" boundary, building the `Witness`/`Fragment`;
`parts_of` folds the lines into ordered `RecordPart`s (a tagged line opens a
`FieldOccurrence`, continuations attach as fragments in order, an orphan
continuation is `Unassigned`); `assemble` splits a record's bytes and wraps the
parts in a whole-record `Witness`, or reports `LineUnreadable` for a
non-line-aligned record. `test/assembly_test.gleam` covers each with examples
and fixture bytes, including the AC classification field (opener plus three
0xAC-marked continuations) assembled end to end, and one full-fixture
integration test that reads the whole `fy94-9049442.bin` from disk (via the
`simplifile` dev dependency) and checks the assembled 56-field sequence, each
field's fragment count, and the whole-record witness against ground truth
derived from the fixture.

Value joining: `src/field_value.gleam` `field_values` joins a field's fragments
into ordered lexical byte values. `card_image.raw_columns` exposes untrimmed
columns 4-72; wrapped continuations append those bytes, marked continuations
open a new value with the first data byte dropped. `trim_trailing_spaces` drops
only ASCII-space pad once per finished value, retaining interior padding,
duplicates and empty values. `field_values(occurrence)` takes no marker argument:
fragment variants already carry assembly's profile-derived classification.
Joining matches those variants directly rather than translating their meanings
into boolean flags.
Tests cover mixed continuations, non-ASCII bytes, short witnesses, supplier-column
exclusion, and actual fixture AC and TI slices.

Record scanning: `src/scan.gleam` `scan` splits a byte buffer into contiguous
`ScannedRecord`s with file-absolute `SourceBase`s. `$$` opens a record; `>>`
closes it before the trailer; EOF closes the last record. `FileStructure` keeps
the last observed header/trailer as complete raw 82-byte lines. Tests cover
multiple records, adjacent separators, empty input, ragged input, absolute
locations, and scanning/assembling/joining all 56 fields of the fixture.

Scanning is not structural validation: CRLF, header/trailer ordering and
multiplicity are unchecked. Ordinary lines outside open records are counted but
not retained. An unexpected `<<` inside an open record is captured as structure
and retained in the contiguous record bytes, matching the reference scanner's
span behavior; dropping it would corrupt subsequent assembly locations.
Callers needing all file bytes must retain the input buffer.

The value-joining and scanning plan is implemented:
`plans/2026-09-13-value-joining-and-record-scanning.md` records execution and
adjustments. The next work is the per-field documentary rule inventory, not
`Project` construction from code-shape guesses. See "Remaining source-based
specification work" below.

### Assembly design (settled and built)

Two questions were settled before building assembly, and hold in the built
`assembly.gleam`:

1. Source citation (the `Witness`/`Location` on each fragment). Assembly takes a
   `SourceBase` (file name and the record's first line number) and fills every
   `Location` from it: `byte_offset = (first_line - 1) * 82`, matching the
   fixture's own extraction record (SOURCES.md: line 83052, byte 6810182). This
   base is machine-derived, never entered by a human per record: when a whole
   file is read, the enclosing scan knows the file it opened and counts lines as
   it splits records; for an isolated fixture record the numbers come from the
   `dd` extraction metadata. Building the model's own types (not a parallel
   structure) is the reason the base is an argument.

2. Marked-value continuations. A continuation line whose column-4 byte equals
   the profile marker is a `MarkedValueStart` (it opens a new value in the same
   field); otherwise it is `WrappedText` (it appends). The marker is `0xAC` for
   this FY94 record, an encoding observed in the data and recorded in
   `registry/evidence.json` (`formatb.encoding.continuation_0xAC`, sourced to
   the FY94 export, not the printed dictionary). It is passed in per profile,
   not hardcoded, and `classify` stays profile-free; `continuation_kind` makes
   the profile-aware call. The `0xAC` evidence is a data observation, a
   different grade from the PDF dictionary rules, and should be cited as such.

This directory is a Gleam project (`gleam.toml`, `src/`, `test/`) targeting
JavaScript; `gleam test` resolves `gleam_stdlib` and `gleeunit` normally. That
the opaque `Accession` constructor cannot be called from another module is a
compile-time guarantee of the `opaque` keyword, verified once during the spike
rather than re-tested at each run.

Validation with Gleam 1.18.1 on the JavaScript target: `gleam test` reports
68 passed, no failures, and `gleam format --check src test` is clean across the
project. The two unused-private-constructor warnings for Project and
LoadedRecord are expected: their complete validators are not implemented.

The compiler did force one concrete distinction during this revision:
BitArray includes non-byte-aligned values, so matching a byte plus remaining
bytes and an empty array was not exhaustive. The accession helper now explicitly
rejects other remainders. Its public input is a BitArray of the extracted field
bytes (columns 4-72 of the card image, trailing blanks dropped), not text in
some encoding: the source is a single-byte card image, so modelling the input
as bytes is the faithful choice and removes any byte-versus-character question.
The non-byte-aligned remainder it rejects is a demand of Gleam's representation,
not evidence that Format B contains partial bytes or a historical discovery.

This is not a new parser, complete CRIS/HNRIMS schema, or fixture-to-project
implementation. Section types still contain Strings whose constraints the
future Project constructor must check. Type-checking is not corpus validation.
The existing public parser interface and byte-for-byte parity requirement remain
unchanged; the richer research model is separate from that compatibility surface.

### Maintainability review and the language comparison

A fresh read-only reviewer recommended two focused changes, now applied:
remove joining's unused marker parameter and retain the named fragment variants
through the join rather than converting them into positional booleans. A test
assembles the same bytes under two markers and checks the different joined
results: the profile interpretation belongs to assembly. Another tests the
existing wrapped-first fallback for manually constructed occurrences; that
fallback is reader behavior, not an assertion about permitted Format B records.

The evidence for the Gleam patterns is the official tour's
[record accessors](https://tour.gleam.run/data-types/record-accessors/),
[recursion](https://tour.gleam.run/flow-control/recursion/), and
[tail calls](https://tour.gleam.run/flow-control/tail-calls/), together with pinned
`gleam_stdlib` 1.0.5 `list.gleam:498-511` (`try_map_loop`): direct case analysis,
error propagation, consing onto an accumulator and reversing once. This supports
keeping the existing recursive walkers, not mechanically replacing them with
callbacks. The two changes above are maintainability judgments, not language
requirements.

The object of comparison remains how Gleam and TypeScript help or hinder our
expression of what we know about Format B. Here, Gleam's named variants and
exhaustive matching keep tagged, wrapped and marked fragments visible at the
point of joining. TypeScript can also express those distinctions with a
discriminated union; this revision alone does not demonstrate a uniquely Gleam
benefit. Neither the marker's historical meaning nor documentary rules are
established by the compiler. The interpretation still comes from the evidence.

## Evidence used

- Captured PDF, local preservation copy:
  `../../../dataset-cards/research/cris-dialog/sources/nara/367_1DP.pdf`.
  Page numbers here are PDF pages. OCR was read for the format instructions,
  dictionary and validation; page images 2, 11, 13, 16, 18, 23, 28 and 30 were
  additionally read, and for the rule inventory also 12, 14, 15, 17, 19, 20, 21,
  22, 23, 29, and 31-33 (p.18 too, for the classification columns). The dictionary title page (p.11) is dated February 1990; the "DATA
  FORMAT" card-image section (p.2) is dated Feb 1986; the NARA validation
  statement (p.28-30) covers the FY1991 file — three vintages, distinct from the
  FY1994 fixture.
  Other OCR details, especially symbols, must still be checked visually before
  making exact transcription/byte claims.
- Complete `../../packages/cris-formatb/fixtures/fy94-9049442.bin`:
  RG164.CRIS.FY94.txt lines 83052–83173, 10,004 bytes, SHA-256
  `87a1e74c56dd20e5b05e95f19fdc84658ec6e652f686e6ed6acca0764cc7af76`.
  Hash recomputed and all 122 lines read for this exercise. Source extraction
  details remain in the package's `fixtures/SOURCES.md`.
- Current `../../packages/cris-formatb/src/{index,offsets,record,profiles}.ts`.
  Ran scanRecords/parseRecord on that fixture with base line 83052 and the
  fy1991plus profile. This is a reading of the existing behavior, not a new
  parity test.

No inherited motivation for rewriting was used.

## The complete example, before modeling

The project is AN **9049442**, PN **1275-21000-008-00D**:
“GENE TRANSFER AND TISSUE CULTURE TECHNOLOGIES FOR IMPROVEMENT OF PEACH,
SOYBEAN, AND TOBACCO”. The supplied institutional description places the work
at Beltsville Agricultural Research Center; investigators are Hammerschlag F A
and Owens L D, in that order.

| File lines | Supplied description |
|---|---|
| 83052 | `$$` record separator |
| 83053–83058 | AN, process date PD, status PS, agency AS, division/station DS, project number PN |
| 83059–83067 | IC, PI, CY, ST, ZP, RE, OC, PF: coded and named institutional/location descriptions; PT INHOUSE |
| 83068–83069 | Two separately tagged IN occurrences |
| 83070–83071 | One TI occurrence spanning two lines; PEAC / H crosses the line boundary |
| 83072–83079 | SD/SX, TD/TX, FY, UP, PP/PX: several distinct temporal descriptions |
| 83080–83082 | BT 080%, AT 020%, DT 000% |
| 83083–83110 | AC, CM, FS, RP, CT, PA, JC; each has four values carried in one tagged occurrence |
| 83111–83114 | One SC occurrence with two code/literal values, then one SN occurrence with two percentages |
| 83115 | SF CRIS |
| 83116–83119 | OB objectives; dis / ease crosses a line boundary |
| 83120–83134 | AP approach, including address, routing-like text, date and scientist names within the narrative |
| 83135–83138 | DE descriptor text |
| 83139–83160 | PR progress narrative |
| 83161–83169 | Nine separately tagged PH occurrences |
| 83170–83173 | Four separately tagged GH occurrences |

Statement of absence, scoped to this reading: PB and UD were not found by
line-by-line byte inspection of these 122 fixture lines. That does not establish
absence elsewhere. Publications is optional in the dictionary, so a completed
validator could represent its permitted omission here with None. An unreadable
or invalid PB occurrence must instead produce a construction problem, never None.

## What the first articulation changes or preserves

### 1. A supplied record and a project account are not identical

The current parser returns ordered SourceField occurrences, each with values
and source spans. This already preserves considerably more structure than a
map of tag to text. Its `LogicalRecord` is not a strongly typed project entity:
`tag` is String and all field kinds share one SourceValue shape.

The model distinguishes SuppliedRecord from the prescribed Project. The latter
groups identity, institution/participants, chronology, classifications and
narratives. **Those groupings are this reading's proposal**, not named sections
asserted to exist in the original file. Assessment retains the supplied record
whether construction succeeds or fails; the Project is not its replacement.

### 2. Repetition has at least two material forms

The two investigators repeat the IN tag. The four AC values occupy one AC field
with three 0xAC-led untagged lines. PH repeats its tag for each heading.
The existing parser distinguishes repeated fields from marked values; the new
sketch preserves rather than claims to discover that distinction.

PDF p. 16 (printed p. 4), visually checked: IN permits “Up to 6 investigator
names, each with its own IN tag”; its sort cell says “first IN is sort”. Thus
investigator order has a documented retrieval consequence. A set of people
would lose it. The revised draft keeps a nonempty ordered list. The future checked constructor
must enforce the upper bound of six and individual name constraints; the list
type alone does not.

### 3. Physical continuity and textual continuity differ

TI ends one line with PEAC and begins the next with H. OB similarly splits
dis/ease. Joining with an inserted space would change the words. The existing
parser concatenates the fixed data slices without inserting a character and
trims at the end. It retains field spans, but not a separate object for every
wrapped line after joining.

The draft retains source bytes and names TaggedStart, WrappedText and
MarkedValueStart. These are interpretive classifications of lines; the compiler
cannot discover the marker meaning from raw bytes. They make the step between
line reading and text reconstruction available for examination.

### 4. Chronology is not one project date

In this witness PD is 860516, SD/SX are 870801 / 01 AUG 87, TD/TX are
920730 / 30 JUL 92, FY is 1992, and UP is 930420. The distribution is the FY1994
file. These labels must not be collapsed into a single date or a single
“year of project”. Why this combination appears is a historical question,
not something established just by naming types.

PDF p. 16 explicitly distinguishes searchable SD/TD from supplied display
forms SX/TX. PairedDate preserves both forms without assuming agreement or
silently choosing a century for two-digit years. A later interpretation can
check agreement; a constructor accepting Strings does not.

### 5. Classification looks relational, but the first model must not assume the relation

Each of AC, CM, FS, RP, CT, PA and JC has four values in this record; repeated
codes occur. For example AC is A4900, A5000, A4900, A4900, while CT is
042%, 028%, 015%, 015%. Deduplication would destroy positional information.
PDF p. 18 describes repeated classification codes and columnar display.

The draft keeps seven ordered columns rather than declaring four linked tuples.
Whether corresponding positions constitute seven attributes of one allocation
needs a closer reading of the display/classification documentation and more
records. Equal lengths here are evidence to pursue, not sufficient proof.
This question emerges within the project account, not as an isolated SN exception.

### 6. Documentary prescriptions become construction obligations

PDF p. 13's AN row specifies numeric, exact length seven, nonrepeating, always
present; the examples include leading zeroes. `accession.parse` implements our
lexical reading of numeric as seven ASCII-digit bytes. Its opaque
constructor prevents callers from labeling unchecked bytes as an Accession.
It returns WrongByteLength or NonAsciiDigit rather than correcting the value.
Byte length is checked first, so a multibyte input may fail the length check.

This constructor does not check field presence, repeated AN occurrences, or
accession uniqueness across records. Those are distinct record-level and
collection-level obligations. A Project requires one supported Accession;
record construction must report missing/repeated occurrences rather than pick
one silently. Uniqueness cannot be certified from a single project record.

The previous permissive model allowed nearly any witness to fit. This revision
intentionally makes conformity a substantive claim. The original witness stays
representable even when a Project cannot be constructed.

### 7. The dictionary crosses the submission/loading boundary

PDF p. 23 describes UD as generated by DIALOG at loading. Consequently the draft
separates LoadedRecord from SuppliedRecord instead of requiring a source UD.
This is an articulation of an already documented distinction, not new evidence
that the project ever appeared in a particular live DIALOG loading.

## Remaining source-based specification work

No compiler pressure has yet produced a historical discovery. The first
side-by-side reading supplied distinctions subsequently expressed in Gleam;
their attribution to Gleam remains unestablished.

Before implementing complete construction, transcribe and scope the rules for
all modeled fields: requiredness, repetition (occurrences versus values),
lexical lengths and character classes, and any supported relationships. Check
the relevant page images, including handwritten amendments. Do not promote
examples such as NEW/TERMINATED into exhaustive vocabularies without support.
HNRIMS-specific and other CRIS fields still need substantive modeling; an
unmodeled occurrence must be reported rather than silently certified.

Evidence containers still do not enforce valid offsets, byte lengths or
provenance correspondence. Full field coverage is an obligation of the future
validator. Date agreement, aligned classification tuples and percentage totals
must not be enforced merely because they seem sensible. Record unresolved
interpretations explicitly and distinguish them from confirmed disagreements.

The design choice is settled: model the assertions and confront failures to
satisfy them. What remains is determining exactly which assertions we can
responsibly make and testing their construction against complete records.

### Documentary rule inventory (in progress)

The per-field transcription now lives in `rules/field-rule-inventory.md`,
source-linked to page images (not OCR alone). **Batch 1** covers the
identity/required fields AN, PN, TI, IN, SF and the provisional PS; **batch 2**
covers the chronology fields PD, SD, SX, TD, TX, FY, UP, PP, PX. Each entry
records the exact cell wording, PDF page/row, our interpretation, stage, evidence
grade, requiredness, repetition, lengths/character constraints and unresolved
questions. Key batch-1 results, none of which the compiler produced:

- **Ready to implement** (printed grade, checkable against supplied bytes): AN
  (numeric, exactly 7, done in `accession.gleam`); PN required, non-repeating,
  length ≤ 20; TI required, non-repeating, joined length ≤ 100; IN required,
  ordered 1..6 occurrences, each ≤ 30, first is sort; SF required, repeating,
  each 4..11.
- **Not ready**: any character-class check — the Character Type codes "A"/"A,N"
  are contradicted by their own examples (PN hyphens, TI/IN spaces, SF caret), so
  they are not literal `[A-Z0-9]` classes; and any PS rule at printed grade.
- **PS refinement**: the *entire* PS row (element 2.2) is handwritten, not an
  amendment to a printed row — so `Provisional(PS)` is better supported than the
  `record_model.gleam` comment states; that comment's "amendment" wording should
  be tightened. Recorded as a disagreement, not silently repaired.
- **Dictionary is known-incomplete**: the FY1991 NARA validation statement
  (PDF p.28-29) names two data elements present in the data but absent from the
  dictionary — Field Tags **SN** and **BP** — confirming that an SN/BP occurrence
  is a documented `FieldNotYetModeled` case, not a nonconformance.
- **Tension recorded**: the dictionary's "Always Present = Y" versus the FY1991
  statement "the data elements may vary per physical record" (PDF p.28).

Key batch-2 (chronology) results:

- **Ready** (printed grade): every chronology field is non-repeating with an exact
  printed byte length (PD 6, SD 6, SX 9, TD 6, TX 9, UP 6, PP 4, PX 12); all are
  optional except FY. `PairedDate` is confirmed — SX/TX are printed "Not
  searchable" display forms paired with searchable SD/TD, so keeping both forms
  and not asserting they agree is faithful.
- **FY is a two-to-four-digit year amendment, in handwriting.** The printed FY row
  is two-digit throughout (Length "Exact 2", example "86", "Format is YY"); a hand
  widens it to four digits (length 2→4, century "19" prepended to "86",
  "may be 00"→"0000", a caret-inserted "YY"). GY (elem 28) got the same hand,
  written out as "Format is YYYY / may be blank". The fixture's four-digit "FY
  1992" matches only the **handwritten** form. The pattern has the shape of a
  partial Y2K widening but the amendment is undated/unattributed — intent is not
  asserted. Meanwhile SD/SX/TD/TX keep two-digit years with no century, which is
  why `PairedDate`/the model must not normalize centuries.
- **Disagreement recorded**: the dictionary marks FY required (Always Present Y),
  but `Chronology.fiscal_year` is `Option`. Not repaired.

The inventory is now complete across all modeled fields (batches 1-5: identity,
chronology, classifications/headings, narratives, institution/participants +
the UD loading stage). Fields present but unmodeled (SN, NI, HP, CG, RG, RN, GY)
are recorded as `FieldNotYetModeled` candidates. Batch-3 result of note: the
source gives **no** support for aligned classification tuples ("displays columnar
format" is display, not data alignment), vindicating `ClassificationColumns` as
independent lists. The checked `Project` constructor, built field group by
field group as the inventory's closing "Inventory status and next work"
section recommended, is now in place — see the next section.

### Runnable reading over real data (checked Identity, Project)

`src/formatb_reading.gleam` is a runnable entrypoint that reads a whole Format B
file from disk and prints each record parsed **through the model**, not as a raw
dump. It is the first vertical slice of checked construction:

    gleam run -- <path-to-format-b-file> [max_records] [max_lines]

`src/construct.gleam` builds checked groups from a `SuppliedRecord`, enforcing
only the rules the inventory has settled:
- **`identity`** (batch 1): AN numeric, exactly seven bytes, non-repeating,
  required (via `accession.parse`); PN required, non-repeating, length ≤ 20 bytes.
- **`institution` / `participants`** (batch 5 + IN from batch 1): PI/CY/ST
  required with lengths; AS/DS/IC/ZP/RE/OC optional; PF a repeating list;
  investigators (IN) a required ordered list of 1..6, each ≤ 30, first is sort.
  OC's optionality and PF's max length are marked `HandwrittenAmendment` grade.
- **`chronology`** (batch 2): PD/SD/SX/TD/TX/UP/PP/PX optional at their exact
  printed lengths; **FY required** and honouring **both** documented lengths
  (printed Exact 2 `YY` and handwritten Exact 4 `YYYY`) — a value matching neither
  is a divergence. `PairedDate` keeps searchable SD/TD and display SX/TX without
  asserting they agree. No century inference, no date agreement.
- **`classifications`** (batch 3): BT/AT/DT optional Exact-4 percentages; the
  seven columns (AC/CM/FS/RP/CT/PA/JC) as independent multi-value lists with
  per-value length ranges and a Max-15 value count each (no aligned tuples — the
  source asserts none); **SC** as a list of `Subcommodity(code, literal,
  percent)` and **PH/GH** as lists of `Heading(code, literal)` — two types
  because the shapes differ (SC values carry a required percent, PH/GH never do),
  so the type enforces which fields have one; **SN** (undocumented) is
  `FieldNotYetModeled` when present. See "multi-value" below.
- **`narratives`** (batch 4): OB/AP/PR/PB optional at their documented MAX
  lengths (1600/1600/3200/3200) via the byte-preserving `optional_bytes(...)`
  path — verified against the first 3,000,000 lines of
  `data/RG310.CRIS.FY88.txt` (statement of absence, scoped to that method and
  span, FY94 held out): all five narrative fields are single-value, wrapped
  continuations joining to one value, never `0xAC`-marked. **DE** gets a
  dedicated `descriptors` constructor enforcing TWO independent bounds: an
  aggregate MAX 2400 bytes for the whole joined value, AND a documented
  **60-byte max per whitespace-separated keyword** (ASCII-space-run split,
  empty tokens dropped) — both checked and their problems accumulated
  together. The 60-byte bound is enforced at the printed/documented grade
  even though the FY88 scan never observed a keyword over 30 bytes (with a
  pile-up at 30, looking truncated-at-30 in that vintage): honouring the
  written contract, not the narrower observed range, so a held-out FY94
  keyword up to 60 bytes is not wrongly rejected. **HP** has no settled
  dictionary row (it appears twice and inconsistently — a handwritten stub
  and a separate printed row) so any HP occurrence is `FieldNotYetModeled`,
  mirroring `SN`.

  OB/AP/DE/PR/PB (and IN, in `participants` above) are **byte-preserving** —
  `Supported(BitArray)`, not `Supported(String)`. A whole-corpus FY88 UTF-8
  census (32,016 records) found non-UTF-8 bytes confined to exactly these six
  free-text/name fields (AP 1.8%/584, PR 0.7%/221, OB 0.4%/127, PB 0.3%/68, DE
  0.03%/8, IN 0.002%/1), scattered high bytes (`0xa3`, `0xa5`, `0xa7`, `0xfe`,
  `0xdd`, …) consistent with EBCDIC→ASCII conversion artifacts on extended
  characters — evidence to preserve, not noise to drop — while ~40 other
  fields (identifiers, dates, codes, institution/org names, TI, the plain
  columns) are 100% UTF-8 over the same corpus. The checked-field toolkit's
  leaf check (`check_bytes`) is parameterized by a decode step so the
  byte-preserving path reuses the same length checking as the `String` path
  and simply skips the UTF-8 decode; `record_model.render(bytes)` is a
  display-only lossy Latin-1 render (matching the TS parser's `latin1` and
  the inspect panel) for showing a byte-preserving value, never a claim about
  its actual code page (see `registry/evidence.json`).
- **`project`** — the top-level composition: identity, title (TI, required
  upto 100), status (PS, `Provisional`, handwritten grade, presence only — NO
  length enforced, the documented max digit itself is uncertain 16 vs 10),
  project_type (PT, optional upto 20), participants, chronology,
  classifications, narratives, and subfiles (SF, required non-empty, each
  4..11 bytes, **no documented occurrence cap** — hence the new
  `required_nonempty` toolkit fn rather than `bounded_nonempty`). Every
  group's problems accumulate together, so a record can fail several groups
  at once and see all of it in one `Error`. `record_model.build_project` is
  the opaque `Project`'s smart constructor: it performs no checking itself,
  so only `construct.project` — after every group/field is independently
  checked — is meant to call it. `Project.rules` is set to the `RuleRef`s
  `project` applies directly (identity's AN/PN plus TI/PS/PT/SF); each
  group's own rules already ride on that group's own values and problems,
  and extending `rules` to cover every rule used throughout would mean
  threading rules out of every group constructor — deliberately out of scope
  for this composition.

These are built from a small reusable **checked-field toolkit** — `required`,
`optional`, `repeating`, `bounded_repeating`, `bounded_nonempty`,
`required_nonempty`, plus the byte-preserving `optional_bytes` and
`bounded_nonempty_bytes` (OB/AP/PR/PB and IN), all taking one `Length` type
(`exact` / `upto` / `between`) — that serves every group. Using one `Length`
type means every field's documented bound is honoured identically,
**including MIN** (IC/OC "MIN 4"): a present-but-too-short value is a divergence,
not a pass. This non-leniency is deliberate — a `≤max`-only model would be
indistinguishable from the TS parser, so the discipline is the point.

**Multi-value fields.** A single tagged occurrence can carry several values,
separated by the `0xAC` continuation marker (verified against 300k FY88 lines:
SC/PH/GH and the classification columns all do this, as does PF). The checked
constructors consume `field_value.field_values`' full value list, not just the
first value; count caps bound the value count. The SC/PH/GH value's internal
parts are separated by `0xA0 0x02` (data) / footnote `HEX40 HEX41 HEX02` — a
recorded disagreement — and the whole value is not valid UTF-8, so its parts are
kept as **`BitArray`**.

**Payload type is a provenance claim.** `String` in Gleam asserts "valid text",
so it is a *checked* claim, not a default: a value read whole and decoded is
`String` (PN, PI, CY, the plain columns); a value carved from byte structure is
`BitArray` (SC/PH/GH parts). Not a blanket choice either way — the trigger to
revisit a field's payload type is discovering it has structure.

Character classes stay unchecked — "A,N" is not a literal class. Problems are
typed and accumulated across every field, never repaired:
`RequiredFieldNotLocated`, `NonRepeatingFieldRepeated`, `InvalidAccession`,
`InvalidFieldValue`, `RepetitionLimitExceeded`, `FieldNotYetModeled`, each
carrying its source-linked `RuleRef`. `src/report.gleam` renders each record's
Identity, Participants, Chronology, Classifications, and Narratives, plus the
top-level Project result (or their problems), with a summary. Narratives are
rendered as per-field presence (`OB=Y AP=N DE=Y ...`), not the text itself —
OB/AP/PR/PB can run to 3200 bytes — and the Project line shows only its title,
mirroring the concise-summary shape the other group lines already use rather
than dumping the whole opaque `Project`. Every function is covered by
`test/construct_test.gleam` and `test/report_test.gleam`, TDD, each test
watched failing first.

This was exercised on real NARA data. **FY94 is held out** (it is the fixture's
own derivation source); the run used **FY88** (`data/RG310.CRIS.FY88.txt`,
258 MB, 3.15 M lines). Over the first 592 records: all have a valid checked
Identity (e.g. `AN=9000001 PN=PNW-1601`); **all 592 construct Participants and
Classifications cleanly** (e.g. `classifications OK — 7 column code(s), 2 SC,
4 PH, 2 GH`), each SC value split into its required percent. Records missing a
required field report `N problem(s)` rather than being repaired — the "elements
may vary per physical record" tension made concrete. Chronology confirms the FY
decision on real data: `chronology OK — FY=1985` (four-digit, accepted by the
handwritten Exact-4 rule). Note the entrypoint's `--max-lines` slices the file by
line count and can cut the last record mid-way; a truncated record honestly
reports a divergence (e.g. a two-part SC) — a bound of the harness, not the model.

The multi-value handling above was found *by running on real data*: synthetic
tests passed against a wrong single-value mental model; the real bytes did not.
This is why the runnable slice matters — it is the check on the interpretation.

This is not parity with the TS parser, but it is now a whole checked `Project`:
`construct.project` composes identity, title (TI), status (PS), project_type
(PT), participants, chronology, classifications, narratives, and subfiles (SF)
— every group and field the model currently checks — accumulating every
group's problems into one `Error` rather than stopping at the first. The
narratives group's single-value shape (OB/AP/DE/PR/PB never `0xAC`-marked) was
verified separately, replicating the reading layer's value-joining over the
first 3,000,000 lines of `data/RG310.CRIS.FY88.txt` (statement of absence,
scoped to that method and span; FY94 held out).

`construct.project` has now been run end-to-end over the **whole FY88 corpus**
(all 32,016 records, 3.15 M lines, `0xAC` marker; FY94 held out) via the
runnable `tally` module (`gleam run -m tally -- <path>`), which buckets every
record's outcome. After modeling the four adjacency fields RN/CG/GY/RG (batch 6
of the rule inventory), 27,268 records (85.2%) certified a clean `Project`,
with the remaining failures split between UP (3,962 records) and non-UTF-8 text
in the free-text fields (AP 584, PR 221, OB 127, PB 68, DE 8, IN 1 — these fit
their MAX lengths but the constructor then refused to decode them rather than
mangle them). Those non-UTF-8 bytes were hypothesised to be EBCDIC→ASCII
conversion artifacts from the transform lineage the data passed through before
NARA distribution (the same hypothesis `registry/evidence.json` records for
`0xAC`/`0xA0`/`0x02`) — evidence to preserve, not noise to drop — so
OB/AP/DE/PR/PB and IN were switched to the byte-preserving `Supported(BitArray)`
payload (as SC/PH/GH already kept `BitArray`), dropping the UTF-8 decode step
while keeping every documented length/requiredness rule unchanged. That took
certification to **28,054 (87.6%)**, leaving UP as the sole remaining divergence.

A UP length census then corrected an earlier guess: the 3,962 non-conforming UP
values are **not** a 4-byte `YYMM` form — they are **empty** (a present `UP` tag
with an all-pad value), and UP is the only field in the whole corpus that does
this (12.4%). In fixed-width, space-padded card data a blank optional field is
indistinguishable from an absent one, so `optional`/`optional_bytes` now read a
present-but-empty value as omission (`None`), not a length divergence — a general
rule that only UP exercises, and one that still fails non-empty wrong-length
values and empty *required* fields. With that, **all 32,016 FY88 records certify
a clean `Project` (100%); 0 fail, 0 unreadable.**

**This 100% is a fit, not a validation.** Every reconciliation above (FY optional,
RN/CG/GY/RG modeled, byte-preserving prose, UP-empty as omission) was
evidence-grounded, but all were made against FY88; a model reconciled until
nothing fails will certify that corpus. The constructor keeps discriminating
power — the tests show it still rejects wrong-length values, missing required
fields, bad accessions, unmodeled tags, and malformed SC structure — so this is
not a rubber stamp. But the real test of whether the model captures Format B
rather than FY88 is **FY94, held out throughout** — now measured (see the FY94
generalization test below). All counts are scoped to this corpus and marker.

### FY94 generalization test (held-out corpus)

`construct.project` was run end-to-end over the **whole held-out FY94 corpus**
(`data/RG164.CRIS.FY94.txt`, 3,384,622 lines, 34,090 records, `0xAC` marker) via
the same `tally` module. This corpus was held out through every FY88
reconciliation above; it is also a **different record group** (RG164, not FY88's
RG310), so it stresses both fiscal-year vintage and agency provenance at once.

**Initial result (before any FY94-informed reconciliation): 7.0% certified**
(2,383 of 34,090); 31,707 failed; **0 unreadable.** The model does not
generalize as-is — and the split shows exactly where.

- **The format frame generalized perfectly.** 0 unreadable across 3.38 M lines:
  82-byte/CRLF alignment, `$$` record separators, the `<<` header, the `0xAC`
  continuation marker, and the `0xA0`/`0x02` internal separators are all
  identical in RG164/FY94. The scan → assemble reading layer is not overfit.
- **One field rule overfit, and it dominates.** The failure buckets were
  `SC invalid-structure` 67,723 (the real divergence), `SN not-yet-modeled`
  27,607 and `BP not-yet-modeled` 19,739 (coverage gaps — unmodeled tags, not
  conflicts; BP does not occur in the FY88 modeled set), and 4 others. Only
  4,100 of 31,707 failures are unmodeled-only, so this is a genuine documentary
  conflict on SC, not merely missing tag coverage.
- **Root cause, confirmed against real data** (not inferred): every SC failure
  reports the same reason, `expected 3 parts (code, literal, percent) separated
  by 0x02 but found 2`. FY94/RG164 SC values are two-part — e.g.
  `S3140 [A0][02]Dairy Cattle-Milk` (code, literal) with **no percent** — while
  FY88/RG310 values carry a third percent segment. The `subcommodity_field`
  parser hard-required the percent; its own `RuleRef` note recorded the overfit
  ("percent required (present in every FY88 value)"). A coverage fact about one
  corpus had been asserted as format law. **This is the falsification the
  held-out corpus was for**: a concentrated, legible, directional failure (one
  field, one rule, provably too strict) rather than a scattered misread of the
  format itself.

The reconciliation that followed this finding is recorded next.

#### Reconciliation, and what remains

Two evidence-grounded changes followed, each re-verified against **both** corpora
(FY88 must stay clean; FY94 must improve):

1. **SC percent → optional.** `Subcommodity.percent` became an `Option`: a value
   may be two-part (code, literal) or three-part (code, literal, percent). This
   no longer asserts a bound only FY88 met, while keeping SC distinct from PH/GH
   (still two-part; a percent on one is still a divergence) and still rejecting a
   one-part or 4+-part SC. Result: the 67,723 SC structure faults went to **0**,
   FY88 held at 100%, and FY94's failures flipped in kind — from documentary
   conflict to unmodeled-tag coverage (99.997% unmodeled-only). Cert rate did not
   move yet, because the same records also carry SN and BP.
2. **BP modeled.** A census showed BP is absent from FY88 entirely but present in
   FY94/RG164, where every one of 19,739 values is exact-12 `YYMM TO YYMM` — the
   same shape as the printed PX (element 27), with which BP co-occurs (so it is a
   distinct field, not a rename). BP has no printed dictionary row; it is one of
   the two tags (with SN) the validation-report addendum (p.28-29) records as
   present in the data but absent from the Data Element Descriptions, described by
   the agency (Aug 26 1992) as "Progress report period covered". It is modeled as
   an optional `Chronology` field under a new evidence grade, `ValidationAddendum`
   (distinct from `PrintedDictionary`/`HandwrittenAmendment`). Result: the 19,739
   BP unmodeled occurrences went to **0**, and FY94 certification rose to **19.0%
   (6,483/34,090)** — exactly the records carrying neither SN nor BP (2,383) plus
   the BP-only records (4,100). FY88 stayed 100%.

**What remains is SN, and it is a documentary limit, not an oversight.** SN
(27,607 records, 81% of FY94) is the *other* validation-addendum tag — "a
percentage that refers to the previous SC field tag" — and the rule inventory
records the explicit instruction *not* to infer an SN rule from its data
behaviour. So SN stays `FieldNotYetModeled`: those records cannot fully certify
until SN's rule is resolved from a source, not guessed. After SC + BP, the only
*real* documentary divergence left in the entire 34,090-record held-out corpus is
a single `DE non-repeating-repeated`; two more `PR`/`PB` `FieldNotYetModeled`
occurrences (3 in 3.38 M lines) are an unexplained edge worth a later glance.

The honest summary of the generalization test: the Format B **frame** generalizes
perfectly across year and record group; one overfit **field rule** (SC percent)
was found and corrected; one **coverage gap** (BP) was filled; and one field (SN)
the source itself left undocumented remains the ceiling on FY94 certification.
All counts scoped to these two corpora and the `0xAC` marker.

This run also produced the project's first data-grounded documentary decision.
The full corpus shows **FY absent in 25.6% of records (8,182/32,016)**, though
the Feb-1990 dictionary marks FY "Always Present Y". That requiredness is a
later vintage than FY88 (RG310) and is contradicted by a quarter of the data;
combined with the FY1991 "elements may vary per physical record" caveat and the
model's existing `Option` type, **`construct.fiscal_year` was reconciled to treat
FY as optional for FY88** (absent is `Ok(None)`; a present FY still length-checks
against both documented forms). This resolves the FY required-vs-`Option`
disagreement the inventory had recorded but not repaired, and lifted the clean
certification rate from 48.0% to 55.4%. The basis is recorded in `fiscal_year`'s
`RuleRef` (assertion = the printed rule; interpretation = why it does not govern
FY88), not silently applied.

Validation after this work: `gleam test` **155 passed**, `gleam check` zero
errors (one expected `LoadedRecord` unused-constructor warning — `build_project`
resolved the other, for `Project`), and `gleam format --check src test` clean.
`simplifile` moved to `[dependencies]` and `argv` was added, for the entrypoint
and the `tally` corpus-analysis module; the reference TS parser is unchanged.

## Checkout observation

In this checkout, direct listing/read did not find bytes.ts or
public-api.test.ts at the supplied paths; index.ts uses wildcard exports and
record.ts imports byte utilities from index.ts. This is a provisional,
path-scoped statement of absence, not a claim about other checkouts or prior
work. No parser/interface changes were made for this research sketch.

This reading is now itself a Gleam project (`gleam.toml`, `src/`, `test/`),
built and tested with `gleam test`. The earlier `gleam-spike/` build tree,
whose source had been lost, has been removed.
