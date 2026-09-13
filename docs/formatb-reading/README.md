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
permissive `Reading(...)` slots are removed. Project is opaque and deliberately
has no public construction function yet: a complete rule inventory and validator
must precede any claim to return a valid Project. Required AN, PN, TI, IN and SF
are no longer optional. PS is modelled as `Provisional`: its requiredness rests
only on a handwritten amendment on PDF p. 13, a weaker `EvidenceGrade` than the
printed rows, so a missing PS is a scoped provisional situation to record rather
than a hard nonconformance. Whether that annotation applies remains to settle.

Two steps are implemented. Accession lexical construction: the checks live in
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
than wrapped text, but that split needs a profile transcribed from the source
and is deferred, so `classify` reports both as `ContinuationLine`. File-
structure lines ("<<" header, ">>" trailer) sit outside a record span and are
the line-splitting step's concern, not `classify`'s.

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

What the reading layer does not yet do: assemble the classified lines into the
model's `FieldOccurrence`s (each a tagged line plus its continuation Fragments,
with a `Witness`/`Location`) and a `SuppliedRecord`; join a field's fragments
into one lexical value (concatenating raw columns 4-72 and dropping the trailing
pad once at the end, so an interior nonconformance is not silently repaired);
and detect record boundaries and file header/trailer within a multi-record
buffer. Nothing constructs toward `Project`. See "Remaining source-based
specification work" below.

### Assembly design (settled, not yet fully built)

Two questions were settled before building assembly:

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
32 passed, no failures, and `gleam format --check src test` is clean across the
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

## Evidence used

- Captured PDF, local preservation copy:
  `../../../dataset-cards/research/cris-dialog/sources/nara/367_1DP.pdf`.
  Page numbers here are PDF pages. OCR was read for the format instructions,
  dictionary and validation; page images 2, 11, 13, 16, 18, 23, 28 and 30 were
  additionally read.
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

## Checkout observation

In this checkout, direct listing/read did not find bytes.ts or
public-api.test.ts at the supplied paths; index.ts uses wildcard exports and
record.ts imports byte utilities from index.ts. This is a provisional,
path-scoped statement of absence, not a claim about other checkouts or prior
work. No parser/interface changes were made for this research sketch.

This reading is now itself a Gleam project (`gleam.toml`, `src/`, `test/`),
built and tested with `gleam test`. The earlier `gleam-spike/` build tree,
whose source had been lost, has been removed.
