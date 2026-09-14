# Format B documentary rule inventory

Source-linked rules for the modeled fields, transcribed from page images (not OCR
alone) before any checked `Project` constructor is written. Each entry records the
documentary assertion, its exact wording or a marked paraphrase, the PDF page and
table row, our proposed interpretation, the applicable stage, the evidence grade,
requiredness, repetition (occurrences versus values), lexical length and character
constraints, and unresolved questions.

Existing `record_model.gleam` choices are treated here as **interpretations to
check**, not documentary authority. Disagreements between source, model, and the
reference TypeScript parser are recorded, not silently repaired. Every statement
of absence is scoped and marked provisional.

The batches below cover every field the model touches: **batch 1** identity
(AN, PN, TI, IN, SF, provisional PS); **batch 2** chronology (PD, SD, SX, TD, TX,
FY, UP, PP, PX); **batch 3** classifications, percentages, headings, and the
undocumented SN; **batch 4** narratives (OB, AP, DE, PR, PB, HP); **batch 5**
institution/participants, project type, and the UD loading stage; **batch 6** the
RN/CG/GY/RG adjacency. The **FY94 generalization test** (2026-09-14) then added
two field-rule changes from the held-out RG164 corpus: SC's percent was
reconciled to optional, and **BP** was modeled (its own entry below, evidence
grade `ValidationAddendum`). Transcription is complete; this still does **not**
claim complete `Project` validation — that is the constructor work the closing
section scopes.

## Sources and provenance

- **Dictionary**: `dataset-cards/research/cris-dialog/sources/nara/367_1DP.pdf`,
  the "CRIS/HNRIMS Data Element Descriptions" table. Title page (PDF p.11):
  "DIALOG FILE DESIGN SPECIFICATIONS / FORMAT B", "February 1990". The table is
  in **data-element-number order** (PDF p.12 divider "DATA ELEMENT NUMBER ORDER").
  Printed "Page N" of the table = PDF page 12 + N (verified: p.13 = "Page 1",
  p.16 = "Page 4", p.20 = "Page 8", p.21 = "Page 9").
- **Card format**: PDF p.2, section "DATA FORMAT / 1. Card Image Form", footer
  "(Feb 1986) 1". A **different, earlier document** than the Feb 1990 dictionary,
  bound in the same PDF. Provenance distinction worth keeping.
- **Validation**: PDF p.28-30, a NARA "Validation Statement", Accession
  NN3-164-93-001, prepared by T. Southerly, June 12 1995, for the CRIS **Fiscal
  Year 1991** file. Its sample printout (p.31-33) is a **different record** (AN
  9000001, a Forest Service forestry project) and, in the pages read, incomplete.
- **Fixture** under study is **FY1994** (`fy94-9049442.bin`). So three vintages
  are in play — dictionary Feb 1990, card format Feb 1986, validation of FY1991,
  fixture FY1994. Do not assume a rule transcribed from one applies unchanged to
  another without saying so.

Prior source readings from these sessions are **source-restricted** (notebook):
do not export this inventory outside the team archive.

## Column legend (verified, PDF p.13 header)

Data Element No. | Name of Data Element | Format B Field Tag | Example(s) |
Character Type | Length | Repeating Field | Always Present | Word And/or Phrase
Indexing | Dialog Search Code | Dialog Display Code | Sort Code | Remarks.

Interpretation of the columns (ours, to check): **Character Type**, **Length**,
**Repeating Field**, **Always Present** describe the *supplied* card-image value
and are Supplied-stage constraints. **Word/Phrase Indexing**, **Dialog Search
Code**, **Dialog Display Code**, **Sort Code** describe DIALOG's handling of the
value and are DIALOG-loaded-stage facts, not constraints on the submitted bytes.
This split is our reading of the table, not a printed statement.

## Structural rules (card image, PDF p.2, printed, Feb 1986)

Exact wording:
- "Each record must begin with a line containing two dollar signs ($$) in columns
  1-2 (columns 3-80 in the line must contain blanks). The two dollar signs are
  the required record separator."
- "Column 1-2: A two-letter uppercase (no numeric characters) field tag for each
  field (e.g., TI for title, AU for author, AB for abstract)."
- "Column 3: A blank space."
- "Column 4-72: Data for each field."
- "Column 73-80: Must consist of blanks or contain information for the supplier's
  own use. This data will be ignored."

Interpretation: these are already implemented faithfully in the reading layer
(`card_image.gleam`, `scan.gleam`). Stage: Supplied. Evidence: PrintedDictionary
(card-format document). Note the tag rule "two-letter uppercase (no numeric
characters)" is a general constraint on every tag, including the six below.

Continuation lines: p.2 says data lines follow the format above "with the
exception of continuation lines which are discussed on page 4". That page-4
section belongs to the Feb-1986 card-format document, whose **page 4 is not
present in this PDF** — only its page 1 (PDF p.2) was scanned/located (pp.3-5 and
the surrounding front matter are validation-printout dumps, not the card-format
spec). So the printed continuation-line rule exists but **was not found in the
pages available**; scoped statement of absence (this reader, page-image + OCR
scan of PDF pp.1-33 and the full-text index, 2026-09-13).

The **0xAC continuation marker specifically** is NOT a printed rule found here:
it is an FY94 data observation. But byte-level markers are not wholly
undocumented — the dictionary's SC row (elem 39) prints a caret notation whose
footnotes on pp.20-24 expand it to a byte sequence "HEX40 HEX41 HEX02"
(0x40 0x41 0x02), a *different* value from the observed 0xAC. The FY1991
validation printout renders continuation instead with a leading blank tag or a
hyphen prefix (p.32-33: "OF THE IN" / "TERIOR...", "XFRS Forestry Related" /
"-S0613 Other Western Conifers"). Whether the FY1991 "-" is a rendered control
byte or a literal hyphen cannot be told from a character printout — [unresolved].

---

## AN — Accession Number (element 1)

- **PDF p.13, table row 1.** Evidence grade: **PrintedDictionary**. Stage:
  **Supplied**.
- Exact cells: Name "CRIS/HNRIMS Accession Number"; Tag "AN"; Example(s)
  "0040349", "0012345"; Character Type "N"; Length "Exact 7"; Repeating Field
  "N"; Always Present "Y"; Indexing "Phrase"; Search "AN="; Display "AN"; Sort
  "Y (default is AN,D)"; Remarks "Unique control number; CRIS AN is same as
  DIALOG AN".
- **Requiredness**: required (Always Present "Y", printed).
- **Repetition**: non-repeating (Repeating Field "N"). One occurrence, one value.
- **Length / character class**: exactly 7, Character Type "N" (numeric). Examples
  include a leading zero ("0040349", "0012345").
- **Interpretation**: exactly seven ASCII digits, leading zeroes significant, no
  trimming or repair. Already implemented in `accession.gleam` (`WrongByteLength`
  / `NonAsciiDigit`). **Ready to implement** — indeed already the one settled
  constructor.
- **Model check**: `Identity.accession: Supported(Accession)` (required) agrees.
- **Unresolved / scope**: "Unique" is a collection-level property (across
  records) that cannot be certified from one record — out of scope for a single
  supplied record, as the model already notes.

## PN — Project Number (element 5)

- **PDF p.13, table row 5.** Evidence grade: **PrintedDictionary**. Stage:
  **Supplied**.
- Exact cells: Name "CRIS/HNRIMS Project Number"; Tag "PN"; Example(s)
  "050-2100-007-255", "P30AM26659-03"; Character Type "A,N"; Length "MAX 20";
  Repeating Field "N"; Always Present "Y"; Indexing "Phrase"; Search "PN=";
  Display "PN"; Sort "PN"; Remarks "Project number assigned by performing
  organization".
- **Requiredness**: required (Always Present "Y", printed).
- **Repetition**: non-repeating ("N"). One occurrence, one value.
- **Length / character class**: max 20 (no minimum stated). Character Type "A,N".
- **Interpretation**: required, single occurrence, value length ≤ 20 bytes.
  **Length + presence + non-repetition are ready to implement.** The **character
  class is NOT ready**: both printed examples contain a hyphen ("-"), which is
  neither a letter nor a digit, so "A,N" cannot be read literally as "only
  `[A-Z0-9]`". Do not impose a strict alphanumeric regex. (Fixture PN
  "1275-21000-008-00D" is 18 bytes, ≤ 20.)
- **Model check**: `Identity.project_number: Supported(String)` (required,
  single) agrees. A future smart constructor may check length ≤ 20 but must not
  assume a letters/digits-only class.
- **Unresolved**: what exactly "A,N" permits (hyphen certainly; other
  punctuation?). Is "MAX 20" a byte length or a character length? The source is a
  single-byte card image, so byte length is the faithful reading here, but the
  dictionary does not say — [unresolved].

## TI — Title (element 19)

- **PDF p.16 ("Page 4"), table row 19.** Evidence grade: **PrintedDictionary**.
  Stage: **Supplied**.
- Exact cells: Name "CRIS/HNRIMS Title"; Tag "TI"; Example(s) "WATER MANAGEMENT
  IN IRRIGATED AGRICULTURE"; Character Type "A,N"; Length "MAX 100" [agent flagged
  a trailing "." as possible artifact]; Repeating Field "N"; Always Present "Y";
  Indexing "Word"; Search "/TI"; Display "TI"; Sort "-"; Remarks "Upper-case text
  field".
- **Requiredness**: required (Always Present "Y", printed).
- **Repetition**: non-repeating ("N"). One occurrence. NOTE: one occurrence may
  still span multiple physical card lines by continuation (fixture: "PEAC"/"H"
  across a line boundary). Physical-line continuation is value assembly, not tag
  repetition — the two are distinct and both are already handled by the reading
  layer.
- **Length / character class**: max 100; "Upper-case text field" (Remarks). The
  example contains spaces, so "A,N" again does not literally exclude non-alnum
  bytes.
- **Interpretation**: required, single occurrence, joined value length ≤ 100
  bytes, uppercase text. **Presence, non-repetition, and max length ≤ 100 are
  ready.** "Upper-case" is a real printed constraint but its exact scope (does it
  forbid lowercase entirely? what about digits and punctuation?) is not spelled
  out — treat as a check to design carefully, not a strict `[A-Z ]` filter.
- **Model check**: `Project.title: Supported(String)` (required, single) agrees.
- **Unresolved**: max-100 as bytes vs characters; exact meaning of "Upper-case
  text field"; whether the trailing "." after "100" is punctuation — [unresolved].

## IN — Investigator Name(s) (element 18)

- **PDF p.16 ("Page 4"), table row 18.** Evidence grade: **PrintedDictionary**.
  Stage: **Supplied**.
- Exact cells: Name "CRIS/HNRIMS Investigator Name(s)"; Tag "IN"; Example(s)
  "Gaines T P", "Harper A K III"; Character Type "A"; Length "MAX 30 for each
  IN"; Repeating Field "Y"; Always Present "Y"; Indexing "Phrase"; Search "IN=";
  Display "IN"; Sort "IN (first IN is sort)"; Remarks "Up to 6 investigator
  names, each with its own IN tag".
- **Requiredness**: required (Always Present "Y", printed).
- **Repetition**: **repeating** (Repeating Field "Y") — this is repetition of the
  **tag/occurrence**: "each with its own IN tag". Documented upper bound "Up to 6"
  (Remarks). Order matters: "first IN is sort" (Sort cell). So the occurrences are
  an ordered, non-empty list with a documented maximum of six.
- **Length / character class**: "MAX 30 for each IN" — the max is **per value**
  (per occurrence), not a total. Character Type "A"; example "Harper A K III"
  contains spaces and a roman numeral, so "A" is not literally letters-only.
- **Interpretation**: required; ordered list of 1..6 occurrences; each value ≤ 30
  bytes; first occurrence is the sort key. **Presence, the ordered non-empty
  list, the upper bound of six, and per-value length ≤ 30 are ready.**
- **Model check**: `Participants.investigators: NonEmpty(Supported(BitArray))`.
  `NonEmpty` enforces the lower bound (≥1) via the type; the upper bound (≤6) and
  the per-value length are NOT enforced by the type and remain the future
  constructor's runtime obligation — the model's own comment already says this.
  Agrees. **Payload updated to `BitArray`** after the FY88 UTF-8 census (see the
  payload-provenance rule, batch 3) found IN carries non-UTF-8 bytes in 0.002%
  (1/32,016) of real values — rare, but still evidence to preserve rather than
  reject at the MAX-30 length it otherwise satisfies.
- **Unresolved**: is "Up to 6" a hard supplied-stage cap or a retrieval/display
  convention? It sits in Remarks; we read it as a documented cap to enforce, but
  that is our interpretation.

## SF — Subfile Code(s) (element 40)

- **PDF p.20 ("Page 8"), table row 40.** Evidence grade: **PrintedDictionary**.
  Stage: **Supplied**.
- Exact cells: Name "CRIS/HNRIMS Subfile Code"; Tag "SF"; Example(s) "CRIS",
  "HNRIMS", "CRIS^ HNRIMS" (caret is **printed** — same monospace typeface as the
  text, corroborated by the SC row (elem 39) on the same page, which prints the
  identical caret three times; a small space follows the caret as printed);
  Character Type "A"; Length "MAX 11 MIN 4"; Repeating Field "Y"; Always Present
  "Y"; Indexing "Phrase"; Search "SF="; Display "SF"; Sort "-"; Remarks "Subfile
  code(s)".
- **Requiredness**: required (Always Present "Y", printed).
- **Repetition**: **repeating** ("Y"). A non-empty list of occurrences; the row
  states no sort for SF (Sort "-"), unlike IN, so order is preserved by the reader
  but the source asserts no positional significance.
- **Length / character class**: per value min 4, max 11. Character Type "A".
- **Interpretation**: required; non-empty list of subfile codes; each value 4..11
  bytes. **Presence, repetition, and the 4..11 length range are ready.**
- **Model check**: `Project.subfiles: NonEmpty(Supported(String))` (required,
  non-empty) agrees.
- **Unresolved**: the "CRIS^ HNRIMS" example — is a single occurrence allowed to
  carry a composite value (caret-separated), distinct from repeating the tag?
  "CRIS^HNRIMS" without the space is exactly 11 characters = the printed MAX 11,
  which weakly supports a composite reading; and the SC row's caret expands via
  footnote to a byte sequence "HEX40 HEX41 HEX02", so the caret is a documented
  byte-separator notation, not decoration. The SC footnote's exact HEX values on
  the page have not been fully transcribed for SF. [unresolved]. Do not treat
  {CRIS, HNRIMS} as the exhaustive set of subfile codes — they are examples only.
  Fixture value is "SF CRIS".

## PS — Project Status (element 2.2)

- **PDF p.13, bottom row 2.2 — the ENTIRE ROW IS HANDWRITTEN.** Evidence grade:
  **HandwrittenAmendment** for every cell, not merely for requiredness. Stage:
  **Supplied**.
- Exact cells (handwritten): No. "2.2"; Name "CRIS Project Status"; Tag "PS";
  Example(s) "new" / "Terminated"; Character Type "A"; Length "MAX 16 MIN 3"
  [digit slightly uncertain: 16 vs 10]; Repeating Field "N"; Always Present "Y";
  Indexing "Phrase"; Search "PS="; Display "PS"; Sort "-"; Remarks "Project
  Status".
- **Requiredness**: asserted required ("Always Present Y"), but **handwritten**,
  so provisional — a missing PS is a scoped provisional situation to record, not
  a hard nonconformance.
- **Repetition**: non-repeating ("N", handwritten). One occurrence.
- **Length / character class**: min 3, max 16 (handwritten; at 4x the max digit
  leans to 6, so "16" is the better reading, "10" not excluded); Character Type
  "A". Examples "new"(3), "Terminated"(10). The FY94 fixture and the FY1991 sample
  both show uppercase ("PS TERMINATED"); the handwritten example is written "new"
  (lowercase) / "Terminated" (capitalized). *Our reading* (not a source claim) is
  that the hand's casing reflects the annotator, not an allowed-case rule — the
  source leaves case open.
- **Interpretation**: model as `Provisional`, exactly as `record_model.gleam`
  does. **No PS rule should be enforced at the printed-dictionary grade.**
- **Model check**: `Project.status: Provisional(Supported(String))` agrees, and
  is well supported. **Correction to the README/model wording**: the model comment
  says PS requiredness "rests only on a handwritten amendment", implying an
  amendment to an existing printed row. There is no printed PS row at all — the
  whole element 2.2 is a handwritten insertion. The `Provisional` choice is if
  anything better supported than the comment states; the wording should be
  tightened to "the entire PS row is handwritten".
- **Unresolved**: the max length digit (16 vs 10); whether "new"/"Terminated"
  are an exhaustive status vocabulary — **they are examples only; do not build a
  closed enum from them.** Whether the handwritten "Always Present Y" was ever
  adopted as a real requirement or is a proposal — the annotation's authority is
  itself unsettled (matches the model's open question).

---

## Cross-cutting findings

### Character Type "A" / "A,N" is not a literal character class
Every non-numeric field examined has examples that break a strict reading of its
Character Type: PN "A,N" with hyphens, TI "A,N" with spaces, IN "A" with spaces
and a roman numeral, SF "A" with a printed caret. **Interpretation to carry
forward**: "A" and "A,N" are coarse notations, not `[A-Z]`/`[A-Z0-9]` regexes.
A checked constructor must NOT reject a value merely for containing a space,
hyphen, or period on the basis of these codes. This is a single unresolved
question spanning all the alphabetic fields, and it is the main thing blocking
character-class checks. AN "N" (numeric, Exact 7) is the one Character Type we
can read literally, and it is the one already implemented.

### "Always Present = Y" versus "elements may vary per physical record"
The dictionary marks AN, PN, TI, IN, SF (printed) and PS (handwritten) "Always
Present Y". The FY1991 validation statement says (PDF p.28, exact): "The data
elements may vary per physical record, and a data element may span over numerous
logical records." These are in tension. Our reading: "vary per physical record"
most plausibly concerns the many *optional* elements, and the FY1991 sample
record does contain AN, PN, PS, TI, IN, SF — consistent with the required set
being present. But this reconciliation is **our interpretation**, recorded as a
tension, not a repair. A construction failure to locate a required field should
cite both the "Always Present Y" cell and this caveat. A further caveat, also our
choice: we read "Always Present" as a constraint on the *supplied* card image.
It could instead describe the *DIALOG-loaded* file (a field the load step always
populates). The dictionary does not say which; treating it as Supplied-stage is
the stricter reading and the one the model assumes.

### The dictionary is known-incomplete (SN, BP)
PDF p.28-29 (validation, exact): "No discrepancies ... were noted during hand
validation except for two data elements which appear in the data but are not
included in the Data Element Descriptions: Field Tag SN and BP." Remarks given
(from the agency by phone, Note 1, Aug 26 1992): SN "Percentage that refers to
the previous SC field tag. The SN changes depending on the SC."; BP "Progress
report period covered." Implication for construction: an SN or BP occurrence is
**documented as undocumented** — a `FieldNotYetModeled`/`RuleUnresolved` case,
not a silent pass and not a nonconformance. (SN, BP are outside batch 1's fields;
recorded for the inventory's completeness and the next batch.)

> **Update (2026-09-14, from the FY94 generalization test).** Both tags are
> absent from FY88 (RG310) and appear in FY94 (RG164). They now diverge in
> treatment:
> - **BP is now modeled** (see the BP entry below). Its meaning is the agency
>   note above and its shape is unambiguous in the data (exact-12 `YYMM TO YYMM`,
>   19,739/19,739, identical to the printed PX). A new evidence grade
>   `ValidationAddendum` marks that the rule rests on the addendum note plus
>   observed data and the PX precedent, not on a dictionary row for BP itself.
> - **SN stays `FieldNotYetModeled`.** Its meaning ("a percentage tied to the
>   preceding SC") does not fix a checkable shape, and the standing instruction is
>   *not to infer an SN rule from its data behaviour*. SN is present in 27,607 of
>   34,090 FY94 records (81%) and is the ceiling on FY94 certification (19.0%);
>   lifting it needs a source for SN's rule, not a guess from the data.

### BP — Progress Report Period Covered (validation addendum, no element number)

No printed Data Element Description row. Recorded in the validation addendum
(p.28-29) as present in the data but not in the descriptions; the agency described
it (phone, Note 1, Aug 26 1992) as "Progress report period covered".
- **Absent in FY88 (RG310); present in FY94 (RG164).** In FY94, BP co-occurs with
  the printed PX (element 27) — PX=2796, BP=2115 in the first 300,000 lines — so
  BP is a **distinct** field, not a rename of PX.
- **Shape (FY94 census, whole corpus)**: every value is exactly 12 bytes,
  `YYMM TO YYMM` (19,739/19,739, 100.00%); no `0xAC`/`0xA0`/`0x02` markers,
  single-value, non-repeating. This is byte-for-byte the printed PX format.
- **Model check — MODELED (2026-09-14)**: `construct.chronology` gains an optional
  `progress_report_period` field, `optional(record, "BP", bp_rule, exact(12))`,
  parallel to PX. `bp_rule` carries evidence grade **`ValidationAddendum`**: the
  identity is from the addendum note, the shape from the PX precedent plus the
  FY94 census — not a BP dictionary row. Scoped to FY94/RG164; a BP in another
  vintage with a different shape would reopen this.

### Multiple handwritten insertions
PS (elem 2.2) and HP "History Publications" (elem 45.2, PDF p.21) are both fully
handwritten rows; there is a handwritten annotation on the SD remarks (elem 20,
p.16); and the review reported a handwritten "/AP" / "AP" added above the AP row's
search/display codes (elem 42, p.20, reviewer-observed, not independently
re-verified here). The dictionary was hand-patched in several places. This
supports treating handwriting as its own evidence grade generally, not a one-off
for PS.

## Statements of absence (all scoped, provisional)

- **Not found by this reading**, in PDF pp.28-33 only (Sonnet agent, page-image
  read): any printed statement that a specific field is "required", and any
  per-field length in the validation section. Such statements may exist elsewhere
  in the 210-page PDF; only the dictionary rows and pp.2, 11-13, 16, 20-21, 28-33
  were read for batch 1.
- **Not found**, in the FY94 fixture, by prior line-by-line byte inspection of
  its 122 lines (inherited from the README's own scoped statement of absence; the
  reader/method there is the prior session's fixture reading, not re-run here):
  PB and UD.
- **Not found**, in the pages available in this PDF (this reader, page-image +
  full-text scan of pp.1-33, 2026-09-13): the Feb-1986 card-format document's
  "page 4" continuation-lines section that p.2 points to. Only card-format page 1
  (PDF p.2) is present; pp.3-5 and nearby front matter are printout dumps.
- **Scope limit**: this inventory read the specific dictionary rows for AN, PN,
  TI, IN, SF, PS plus the legend and validation pages. It did **not** read every
  page of the 210-page PDF, so "these are all the documentary constraints on
  these six fields" is provisional — a field's rule could be elaborated in a
  notes or instructions section not yet read.

## What is ready to implement (batch 1), and what is not

**Ready now (printed grade, checkable against supplied bytes):**
- AN: numeric, exactly 7 bytes, non-repeating, required. (Done: `accession.gleam`.)
- PN: required, non-repeating, length ≤ 20.
- TI: required, non-repeating, joined length ≤ 100.
- IN: required, ordered list 1..6 occurrences, each value ≤ 30, first is sort.
- SF: required, repeating, each value length 4..11.

**Not ready (do not build yet):**
- Any character-class check for PN, TI, IN, SF (the "A"/"A,N" ambiguity above).
- Any PS rule at printed grade — PS is handwritten throughout; enforce only as
  `Provisional`, and only if the annotation's authority is settled.
- TI "Upper-case" as a strict filter; SF composite/caret values; MIN semantics
  (does a too-short value fail construction, or is MIN advisory?).
- Byte-versus-character length semantics for the MAX/MIN figures.

## Implications for the Gleam/TypeScript comparison (batch 1)

The object of comparison is how each language helps or hinders expressing what we
know about Format B. Batch 1 supports a specific, limited claim:

- The rules that are **ready** are ordinary presence / cardinality / length
  checks. A discriminated union plus a validating constructor expresses them
  equally in Gleam and in TypeScript; nothing here is uniquely Gleam. `NonEmpty`
  encodes IN's and SF's lower bound in the type in Gleam, but the *upper* bounds
  (IN ≤ 6) and per-value lengths are runtime checks in either language, and TS
  can express the same non-empty-list and branded-value types.
- The genuinely useful move this batch makes is **not** linguistic. It is the
  discipline of recording **evidence grade** (PS handwritten vs AN printed) and
  of separating **Supplied-stage** value constraints from **DIALOG-loaded-stage**
  index behavior. `record_model.gleam` encodes evidence grade in the type
  (`EvidenceGrade`, `Provisional`); TypeScript could encode the same distinction
  with a tagged union. The value is the modeling decision, which either language
  can carry.
- The compiler contributed nothing to the hardest results here. The
  character-class ambiguity, the "Always Present" vs "elements may vary" tension,
  and the known-incomplete dictionary (SN, BP) were found by **reading the
  source**, not by type pressure. This is direct evidence for the README's
  standing caution: no compiler pressure has yet produced a historical discovery.
  What Gleam's opaque types plus this inventory *do* give is a place to refuse to
  write a checked constructor for a rule the source does not actually settle —
  and that refusal is a documentary judgment, not a language feature.

# Batch 2 — chronology fields

The fields the model's `Chronology`/`PairedDate` types cover: PD, SD, SX, TD, TX,
FY, UP, PP, PX. Read from PDF p.13 (PD, batch-1 read), p.16 "Page 4" (SD/SX/TD/TX,
elems 20-23), and p.17 "Page 5" (FY/UP/PP/PX, elems 24-27). Method: two Sonnet
agents transcribed p.16 and p.17 from page images; Opus read both pages directly;
a Fable reviewer checked cells against the images. All Supplied stage.

### PD — Process Date (element 2.1, p.13)

Printed. Char N; Length **Exact 6**; Repeating N; **Always Present N**; Phrase;
PD=; PD; Sort Y; Remarks "Format is YYMMDD; also indexed as YYMM (example
PD=8312)". Example 831214.
- Optional, non-repeating, exactly 6 digits, format YYMMDD. **Model check**:
  `Chronology.process_date: Option(...)` agrees.

### SD — Start Date (element 20, p.16)

Char N; Length **Exact 6**; Repeating N; **Always Present N**; Phrase; SD=;
Display "SD but display SX field"; Sort -; Remarks **printed** "Format is
YYMMDD." **plus a handwritten** annotation "Also indexed as YYMM; Example:
SD=8807 [digits uncertain: 8807 vs 0807] Displayed as DD MM YY". Example 880720.
- Optional, non-repeating, 6 digits, YYMMDD (printed). The secondary YYMM index
  and the "DD MM YY" display form are **HandwrittenAmendment** grade.
- Two-digit year; **no century** stated. **Model check**: this is the search form
  in `start: PairedDate(search_form, ...)`, optional — agrees.

### SX — Start Date Display Form (element 21, p.16)

Char **A,N**; Length **Exact 9**; Repeating N; **Always Present N**; Indexing "-";
Search **"Not searchable"**; Display "SD"; Sort -; Remarks "Display form for SD
search field". Example "20 JUL 88". Printed.
- Optional, non-repeating, exactly 9 bytes, human display form, explicitly not
  searchable. The "DD MMM YY" mask is *inferred* from the one example "20 JUL 88"
  and the TD remark; the SX row itself states no mask. Two-digit year (from the
  example). Char A,N because it carries letters and spaces (the cross-batch "A,N
  is not literal" point).
- **Model check**: display form in `start: PairedDate(..., display_form)`,
  optional — agrees. The printed split of a searchable SD from a non-searchable
  display SX directly supports `PairedDate` keeping both forms without asserting
  agreement.

### TD — Termination Date (element 22, p.16)

Char N; Length **Exact 6**; Repeating N; **Always Present N**; Phrase; TD=;
Display "TD but display TX field"; Sort -; Remarks **all printed** "Also indexed
as YYMM (example TD=9106); displayed as DD MMM YY". Example 910630.
- Optional; Char N and Exact 6 are printed. Unlike PD and SD, the TD row has **no
  "Format is YYMMDD" clause** — the YYMMDD arrangement is *inferred* from the
  example 910630, the "also indexed as YYMM" remark, and parallelism with SD, not
  stated on the row. Note the **asymmetry with SD**: TD's "also indexed
  as YYMM / displayed as DD MMM YY" is fully printed, whereas SD's equivalent is
  handwritten — and TD's display mask reads "DD MMM YY" (three-letter month)
  against SD's handwritten "DD MM YY". Recorded as a source inconsistency, not
  reconciled.
- **Model check**: termination search form, optional — agrees.

### TX — Termination Date Display Form (element 23, p.16)

Char **A,N**; Length **Exact 9**; Repeating N; **Always Present N**; Indexing "-";
Search **"Not searchable"**; Display "TD"; Sort -; Remarks "Display form for TD
field". Example "30 JUN 90". Printed.
- Optional, exactly 9 bytes, non-searchable display form; two-digit year (from
  the example "30 JUN 90"; the row states no mask). **Model check**: termination
  display form, optional — agrees.

### FY — Fiscal Year (element 24, p.17)

Char N; **Always Present Y** (the "Y" appears printed); Repeating N; Phrase; FY=;
FY; Sort -.
- **Printed rule** (all two-digit): Length "Exact **2**"; Example printed "**86**";
  Remarks "Format is **YY**; may be **00**". The printed layer is consistently a
  two-digit year.
- **Handwritten amendment** (distinct hand/ink), which widens FY to four digits by
  additions on top of that printed layer: the Length "2" is struck through with a
  "**4**" written below; the century "**19**" is hand-prepended to the printed
  example "86" (→ "1986"); the printed "may be 00" is hand-extended to "**0000**"
  (the third zero is clearly handwritten, the fourth probably); and a handwritten
  "YY" with a caret is inserted beside the printed "YY" in the Remarks. The caret
  reads as a proofreading insertion making "Format is YYYY;". The FY handwriting
  is not a single clean "YYYY" string, but the length change, the prepended
  century, and the caret insertion point all point the same way, and the adjacent
  GY row (elem 28) writes it out explicitly ("Format is YYYY / may be blank"). The
  fact that every four-digit element on the row is in hand while every printed
  element is two-digit is itself the strongest evidence.
- **Interpretation**: the printed spec is a two-digit YY (Exact 2); the amendment
  widens FY to a four-digit year (Exact 4, "may be 0000"). Our FY94 fixture value
  "FY 1992" is four digits and matches the **amended** form only. So any usable
  FY validation rests on **HandwrittenAmendment** grade, not the printed rule.
  [Flagged interpretation, intent unconfirmed: widening the standalone year
  fields FY and GY from two to four digits, while the YYMMDD/YYMM date fields
  keep two-digit years, has the shape of a partial two-to-four-digit ("Y2K")
  year migration. The amendment is undated and unattributed; do not assert the
  motive.]
- **Model check — RECONCILED (2026-09-14)**: the dictionary marks FY **required**
  (Always Present Y), but `Chronology.fiscal_year: Option(Supported(String))`
  types it optional. A full-corpus `tally` run of `construct.project` over FY88
  found FY **absent in 25.6% of records (8,182/32,016)**, so that requiredness — a
  Feb-1990 rule, a later vintage than FY88 (RG310) — does not govern this corpus.
  `construct.fiscal_year` was reconciled to treat FY as **optional for FY88**
  (absent → `Ok(None)`; a present FY still length-checks against both documented
  forms), matching the model type and the FY1991 "elements may vary per physical
  record" caveat. The basis is recorded in `fiscal_year`'s `RuleRef`; scoped to
  FY88, FY94 unmeasured.

### UP — Progress Update Date (element 25, p.17)

Char N; Length **Exact 6**; Repeating N; **Always Present N**; Phrase; UP=; UP;
Sort -; Remarks "Also indexed as YYMM, (example UP=8802). Displayed as YYMMDD".
Example 880203. Printed.
- Optional, 6 digits, YYMMDD. **Model check**: `progress_updated`, optional —
  agrees. (Model field name "progress_updated"; dictionary name "Progress Update
  Date".)
- **Empty-value finding (2026-09-14, full-corpus tally)**: UP is the ONLY field
  in FY88 that appears present-but-empty — a `UP` tag line with an all-pad value —
  in 12.4% of records (3,962/31,949); a length census confirmed the non-6 values
  are length 0, NOT a 4-byte `YYMM` form (that earlier guess was wrong). Reading:
  in fixed-width space-padded card data a blank optional field is indistinguishable
  from an absent one, so a present-but-empty optional value is treated as omission
  (`None`), not an Exact-6 divergence. Implemented generally in
  `optional`/`optional_bytes` (only UP exercises it); non-empty wrong-length values
  and empty *required* fields still diverge. Interpretation (ours), plausibly "no
  progress update yet"; scoped to FY88, FY94 unmeasured.

### PP — Progress Period Ending Date (element 26, p.17)

Char **A,N**; Length **Exact 4**; Repeating N; **Always Present N**; Phrase; PP=;
PP; Sort -; Remarks "Format is YYMM". Example 9012. Printed.
- Optional, exactly 4 bytes, YYMM. **Model check**: `progress_period_end`,
  optional — agrees; the model's name matches the dictionary's "Ending Date".

### PX — Progress Period Covered Printed Form (element 27, p.17)

Char **A,N**; Length **Exact 12**; Repeating N; **Always Present N**; Indexing
"-"; Search **"Not searchable"**; Display PX; Sort -; Remarks "Format is YYMM TO
YYMM". Example "9001 TO 9012". Printed.
- Optional, exactly 12 bytes, "YYMM TO YYMM" (contains the literal " TO " —
  letters and spaces, hence A,N). **Model check**: `progress_period_display`,
  optional — agrees.

### Adjacent, not modeled (recorded for the next batch)

- **GY — Grant Year (element 28, p.17)**: printed "Year of grant award"; printed
  example "85" with a hand-prepended century "19" (→ "1985"); Length correction
  2→4 handwritten; plus a fully handwritten "Format is YYYY / may be blank".
  Apparently the same year-widening hand as FY (same block-capital Y forms and ink
  weight — an attribution, not certain). Optional (Always N). Not in `Chronology`;
  a `FieldNotYetModeled` candidate.

### Chronology cross-cutting findings

- **Requiredness**: among the chronology fields, **only FY is "Always Present =
  Y"**; PD, SD, SX, TD, TX, UP, PP, PX are all "Always Present = N" (optional).
  The model's optional treatment is right for all of them **except FY** (see the
  FY disagreement above).
- **Repetition**: every chronology field is "Repeating N" — one occurrence each.
  Agrees with the model (single `Option`/paired fields, no lists).
- **Lengths are printed and exact** — PD 6, SD 6, SX 9, TD 6, TX 9, UP 6, PP 4,
  PX 12 — all **ready** as length checks. FY's length is **handwritten** (4).
- **The searchable/display split is confirmed.** SX and TX are printed "Not
  searchable" display forms paired with searchable SD and TD. This is exactly the
  `PairedDate` design; the source supports keeping both forms and **not** asserting
  they agree.
- **Two-digit years and the century question.** PD/SD/SX/TD/TX/UP/PP/PX all use
  two-digit years with **no century** given (evidence varies: printed YYMMDD for
  PD, SD, UP and printed YYMM for PP; TD's YYMMDD is inferred; SX/TX/PX rest on
  their examples); FY (and GY) were hand-widened to four digits. A single record therefore mixes a four-digit FY with two-digit start /
  termination years. This is documentary support for the model's refusal to
  normalize centuries or assume date agreement — and it is a fact found by reading
  the pages, not by the compiler.
- **Format strings are format masks, not validators.** "YYMMDD", "YYMM",
  "YYMM TO YYMM" state a shape; the dictionary does not say to reject an invalid
  month or an out-of-range day. Length checks are ready; calendar-validity and
  cross-form agreement are interpretations to design later, not rules to assert.
- **Char type A,N** on SX/TX/PP/PX again is not a literal `[A-Z0-9]` class — the
  values carry spaces and the literal " TO ".

### Ready to implement (batch 2), and not

**Ready** (printed grade): presence-as-optional and non-repetition for PD, SD, SX,
TD, TX, UP, PP, PX; exact byte lengths (PD 6, SD 6, SX 9, TD 6, TX 9, UP 6, PP 4,
PX 12).
**Not ready**: FY's requiredness and its four-digit length/format (handwritten;
also conflicts with the model's `Option`); calendar-validity of any date; any
agreement check between search and display forms; century inference for two-digit
years; char-class checks for the A,N display forms.

### Comparison note (batch 2)

`PairedDate` is the batch's clearest case of the model's interpretive restraint
matching the source: the dictionary itself separates a searchable date from a
non-searchable display form and gives two-digit years with no century, so keeping
both forms optional and refusing to reconcile them is faithful, not fussy. But
TypeScript expresses the same record of two optional fields identically; the
restraint is a modeling judgment, not a language capability. The one place the
type system actively helps is uniform: `Option` forces every optional date to be
handled at the use site in Gleam — and TS's discriminated/optional types do the
same. The FY case is again about **evidence grade**, not language: the rule you
can check against the fixture exists only in handwriting, and no compiler surfaces
that — reading the page does.

# Batch 3 — classifications and percentages

Read from PDF p.17 (BT), p.18 (AT, DT, AC, CM, FS), p.19 (RP, CT, PA, JC), p.20
(SC), p.21 (PH), p.23 (GH, NI). Method: Sonnet page-image transcription + Opus
reads of p.18-20 + Fable review of the batch-1/2 pages; all Supplied stage. Cells
verbatim below; the analytically important results follow.

### Effort percentages BT, AT, DT (elems 29, 30, 31)
All printed, all identical shape: Character Type A,N; Length **Exact 4**;
Repeating N; **Always Present N** (optional); example form "100%"/"075%". Search/
display B1/A1/D1 (note the display cells say "displays AT,BT,DT" — a DIALOG
display grouping, not a supplied-stage fact). **Model check**:
`Classifications.basic/applied/developmental: Option(Supported(String))` agrees
(optional, single, 4 bytes).

### Classification columns AC, CM, FS, RP, CT, PA, JC (elems 32-38)
All printed, Character Type A,N, **Repeating Y**, **Always Present N**. Per-value
lengths differ: AC/CM/FS/PA MAX 89 MIN 5; RP/CT MAX 74 MIN 4; JC MAX 59 MIN 3.
Examples are caret-separated codes ("A4900^ A5000^ / A5300"); the caret is a
**printed** byte-separator that footnotes expand to "HEX40 HEX41 HEX02". Each row's
Remarks read "only one code may be present; **Max 15 codes**; displays columnar
format" (CT: "Max 15 percentages").
- **The README §5 alignment question, resolved from the source**: no row states
  that positions across the columns are aligned or linked into tuples. "Displays
  columnar format" is a **display** behaviour; "Max 15 codes" bounds each column
  independently; "only one code may be present" is per line. The one cross-column
  sentence anywhere is JC's "If PC is displayed, CT displays only once" — again a
  display rule, not a data-alignment claim. **So the model's `ClassificationColumns`
  as seven independent ordered lists (not aligned tuples) is vindicated by the
  source, and equal lengths in one record remain evidence to pursue, not proof.**
- **Ready**: repetition, per-value length ranges, optionality. **Not ready**: any
  tuple/alignment relation (unsupported), char-class checks (A,N), and the
  "Max 15" upper bound is a runtime check the list type does not encode.

### Subcommodity SC (elem 39) and the undocumented SN
SC: printed, A,N, **MAX 2599 MIN 51**, Repeating Y, Always N; two index sub-rows
(Phrase SC= on code, Word+Phrase SH on literal); Remarks "field may be blank;
Max 50 lines; SC and SH display code, literal, and percent in columnar format".
Caret footnote "* S1210-HEX40-HEX41-HEX02-Leguminous Vegetables-General-...-060%".
- **SN has NO dictionary row.** It is the undocumented field named in the FY1991
  validation statement (p.29: "Percentage that refers to the previous SC field
  tag. The SN changes depending on the SC."). So the model's
  `subcommodity_percentages` (SN) is a **documented-as-undocumented**
  `FieldNotYetModeled`/`RuleUnresolved` case, not a checkable rule. Do not infer
  an SN rule from its data behaviour.

### Heading fields PH, GH, and the unmodeled NI (elems 46, 47, 48)
- **PH** (46, p.21): A,N, MAX 2819 MIN 187, Repeating Y, Always N; Remarks
  "Maximum of 60 classifications; only four classifications may be present"; PC
  display note lists "(includes RP, AC, CM, FS, CT)". Model `primary_headings`.
- **GH** (47, p.23): A,N, MAX 1409 MIN 93, Repeating Y, Always N; "Maximum of 60
  classifications; only two classifications may be present"; GC note lists
  "(includes PA, JC, CT)". A **handwritten** "HEX41" with an arrow corrects the
  printed footnote to the full HEX40-HEX41-HEX02 pattern. Model `general_headings`.
- **NI** (48, p.23): A,N, MAX 311 MIN 51, Repeating Y, Always N, "max 6 lines".
  **Not in the model** — a `FieldNotYetModeled` candidate for the next modeling
  pass. (The model's `Heading` type stores code+literal; PH/GH/SC/NI print a
  code + literal + percent in columnar form, so `Heading` may need a percent —
  an interpretation to check, not asserted here.)

### Batch 3 revised from FY88 data (2026-09-14) — SC/PH/GH are multi-value

> **Retraction (2026-09-14).** An earlier version of this section (2026-09-13)
> stated, as a scoped statement of absence, that no trailing percent appears in
> SC/PH/GH, and described each occurrence as a single two-part `code 0xA0 0x02
> literal` value. **Both were wrong**, and the error is exactly what the
> project's statement-of-absence rule warns against: the scan behind them
> (`grep '^SC '` / a first-line byte scan) only ever saw the *first physical
> line* of each occurrence. The percent and the additional values live on the
> **continuation lines** that scan never read. Corrected below, verified through
> the actual reading pipeline (`field_value.field_values`) over 300,000 FY88
> lines, and confirmed end-to-end (`construct.classifications` on 592 real FY88
> records: all 592 construct cleanly).

**Method**: replicate the reading layer's value-joining (tagged line + its
`0xAC`-marked and wrapped continuation lines → the list of lexical values) over
the first 300,000 lines of `data/RG310.CRIS.FY88.txt`; cross-checked by running
`construct.classifications` on the same data. **Scope/limit**: FY88 only;
`RG164.CRIS.FY94.txt` is **held out and unchecked**; provisional to this coverage.

**SC/PH/GH are multi-value fields.** One tagged occurrence carries several
values, separated by the `0xAC` continuation marker at the start of a
continuation line; a value may wrap across lines. Per occurrence: SC averages
2.9 values (1–15), PH 6.0 (4–22), GH 2.7 (2–14). Each value's parts are
separated by `0xA0 0x02` (data) / footnote `HEX40 HEX41 HEX02`:
- **SC value = three parts: `code 0xA0 0x02 literal 0xA0 0x02 percent`.** The
  percent is **present in every FY88 SC value (6487/6487)** — so it is a
  **required** part, not an omission. A value lacking it is a divergence.
- **PH/GH value = two parts: `code 0xA0 0x02 literal`.** No percent (0/17818 PH,
  0/8111 GH). A PH/GH value that carried a percent would be a divergence.

The whole value is **not valid UTF-8** (the lone high byte `0xA0`); each part
decodes as UTF-8 but is kept as `BitArray` (parts carved from byte structure —
see the payload-provenance rule below).

**Modeling decision (yours):** the SC-vs-PH/GH difference is real, so it is two
types, not one type with an optional percent (which would blur it and enforce
nothing): `Heading(code, literal)` for PH/GH; `Subcommodity(code, literal,
percent)` for SC, percent required. The constructor consumes `field_value`'s
full value list (not a single value), so multi-value fields are read whole; the
"Max 15 codes / Max 50 lines / Max 60 classifications" caps bound the **value
count** (for SC, ≤50 values is a sound lower bound on the documented line max,
since each value spans ≥1 line).

### SC percent — FY94 generalization finding (2026-09-14)

Running the composed `construct.project` over the **held-out** `RG164.CRIS.FY94.txt`
(3,384,622 lines, 34,090 records — a different fiscal year *and* record group)
was the first check of any SC rule outside FY88. It falsified the "percent
required" part of the modeling decision above.

- **FY94/RG164 SC values are two-part** (`code 0xA0 0x02 literal`, no percent) —
  e.g. `S3140 0xA0 0x02 Dairy Cattle-Milk`. The percent segment that is present
  in every FY88 value is **absent** from FY94 values. Confirmed through the real
  reading pipeline: every SC failure reports the identical reason `expected 3
  parts (code, literal, percent) separated by 0x02 but found 2` (3,873 such in the
  first 200,000 lines; 67,723 across the corpus).
- **Not a retraction — a scope correction.** The "6487/6487 FY88 values carry a
  percent" census is still true *of FY88*. What was wrong was promoting a
  coverage fact about one corpus to a format-wide **required** part (the modeling
  decision above did so explicitly, rejecting an optional percent). This is the
  statement-of-absence hazard in the requiredness direction: "no FY88 value
  lacks a percent" does not license "no Format B value may lack a percent."
- **Impact**: with percent hard-required, FY94 certified only **7.0%** (2,383 of
  34,090), SC being the dominant divergence (67,723 occurrences). The reading
  frame itself generalized perfectly (0 unreadable).
- **Reconciliation (2026-09-14)**: `Subcommodity`'s percent is made **optional**
  (`Option`) — a value may be two-part (code, literal) or three-part (code,
  literal, percent); both parse, neither is rejected for the other's shape. A
  one-part or 4+-part value is still a divergence. This keeps SC distinct from
  PH/GH (which are always two-part and would still diverge on a percent) while no
  longer asserting a bound only FY88 met. **Re-verified against both corpora**:
  FY88 stayed 100% (byte-identical, the three-part path unchanged); FY94's 67,723
  SC structure faults went to **0**. FY94 certification did not rise on this
  change alone (the same records also carry SN and BP), but its failures flipped
  from documentary conflict to unmodeled-tag coverage — see the BP entry and the
  SN note below.

**Payload-provenance rule (String vs BitArray).** A `String` in Gleam asserts
"these bytes are valid text"; choosing it is a checked claim, not a default. A
value read *whole and checked-decoded* is `String` (PN, PI, CY, the plain
columns); a value *carved out of a byte-structured field* by splitting on
separators is `BitArray` (SC/PH/GH code/literal/percent). Not a blanket flip in
either direction — the trigger to revisit a field's payload type is discovering
it has structure, as happened here.

**Extended by a whole-corpus FY88 UTF-8 census.** A full scan of the FY88
corpus (32,016 records) checked every field's UTF-8 decodability and found
non-UTF-8 bytes confined to six free-text/name fields — AP 1.8% (584/32,016),
PR 0.7% (221), OB 0.4% (127), PB 0.3% (68), DE 0.03% (8), IN 0.002% (1) —
while ~40 other fields (identifiers, dates, codes, institution/organization
names, TI, the plain classification columns) are 100% UTF-8 over the same
corpus. The failing bytes are scattered high bytes (`0xa3`, `0xa5`, `0xa7`,
`0xfe`, `0xdd`, …), the same fingerprint as EBCDIC→ASCII conversion artifacts
on extended characters that motivates the `0xAC`/`0xA0`/`0x02`
transform-lineage hypothesis in `registry/evidence.json` — evidence to
preserve, not noise to drop. This is a second, independent trigger for the
provenance rule (discovered non-UTF-8 content, not carved structure): OB, AP,
DE, PR, PB (`Narratives`) and IN (`Participants.investigators`) were switched
from `Supported(String)` to `Supported(BitArray)`, dropping only the UTF-8
decode step in the checked-field toolkit — no documented length or
requiredness rule changed. `record_model.render` is the shared lossy Latin-1
display render for these fields (and SC/PH/GH), for callers that need text
rather than bytes; it is not a claim about the true code page, which remains
unknown. **Scoped to FY88; FY94 is unmeasured** — the same statement-of-absence
discipline as every other FY88-only finding in this inventory.

**Two disagreements still stand** (recorded, not reconciled, in each RuleRef):
1. **Separator bytes.** Footnote `HEX40 HEX41 HEX02`; data `0xA0 0x02`. Split on
   the observed `0x02`, require a trailing `0xA0`; otherwise a typed divergence.
2. **Length bounds are aggregate, not per-value.** Documented SC MIN 51/MAX 2599
   (PH 187/2819, GH 93/1409) cannot be per-value: real per-value lengths are
   11–49 bytes. Not enforced per value; the separator structure is checked
   instead, and the documented length is recorded as an aggregate.

Columns AC/CM/FS/RP/CT/PA/JC are **also multi-value** (avg 2.6 values/occurrence
in FY88), each value a plain fixed-width code at the documented MIN (AC/CM/FS/PA
=5, RP/CT=4, JC=3; CT values carry a `%`). No `0xA0`/`0x02` separators and no
caret multi-code form were found in the FY88 sample (statement of absence, same
scope). The documented `between(MIN, MAX)` ranges accept them; "Max 15 codes" is
enforced on the value count. **SN** did not appear in the FY88 sample (statement
of absence, same scope); it is `FieldNotYetModeled` when present.

**Same root cause fixed in PF.** The multi-value discovery also applies to PF
(`organization_names`): it too carries `0xAC`-marked values per occurrence, so
`repeating` was changed to consume all values (it had used a single-value read
and mis-reported PF as `FieldNotYetModeled` on 20/592 real records). PF now
constructs cleanly. IN was unaffected in FY88 (single value per occurrence).

# Batch 4 — narratives

Read from PDF p.20 (OB, AP, DE), p.21 (PR, PB), p.22/p.21 (HP). All printed
unless noted; all Supplied stage.

- **OB** Objectives (41): A,N, **MAX 1600**, Repeating N, **Always N**, Word index
  (/OB, /TX), "Upper- and lower-case text field".
- **AP** Approach (42): A,N, MAX 1600, N, **N**, Word; a **handwritten** "/AP" /
  "AP" was added above the printed "/TX" / "TX" index codes. "Upper- and
  lower-case text field".
- **DE** Keywords/Descriptors (43): A,N, **MAX 2400**, N, N, Word (/DE),
  "Upper-case text field; **60-character Max per keyword**" (a per-value bound
  distinct from the field total).
- **PR** Progress (44): A,N, **MAX 3200**, N, N, Word (/PR, /TX), "most recent
  progress report; upper- and lower-case".
- **PB** Publications (45.1): A,N, MAX 3200, N, **Always N (optional)**, Word
  (/PB), "list of bibliographic citations". **Model check**:
  `Narratives.publications: Option(...)` agrees — PB's optionality is printed,
  matching the README's earlier scoped statement of absence about PB in the
  fixture.
- **HP** History Publications (45.2): appears **twice and inconsistently** — a
  fully **handwritten stub** row on p.21 (example "See \"History Publications\"
  attached", "MAX Approx. 30,000+", "Not part of basic index; Not part of Text
  Field (/TX)") and a **printed** row on p.22 carrying the actual bibliography in
  only four columns. Recorded as a source inconsistency, not reconciled. HP is
  **not in the model** (`FieldNotYetModeled`).
- **Model check**: `Narratives` objectives/approach/descriptors/progress/
  publications are all `Option` and all these rows are Always N — agrees. The
  MAX lengths (1600/1600/2400/3200/3200) and DE's 60-per-keyword are **ready**
  length checks; the upper/lower vs upper-case notes are real but their exact
  scope is not a strict filter. **Payload updated to `BitArray`**: all five are
  now `Option(Supported(BitArray))`, not `Option(Supported(String))`, per the
  FY88 UTF-8 census (payload-provenance rule, batch 3) — OB/AP/DE/PR/PB
  together carried non-UTF-8 bytes in 0.03%-1.8% of real values, within their
  documented MAX lengths; the checked-field toolkit still enforces every
  length/requiredness rule above, only the final UTF-8 decode step is
  dropped.

# Batch 5 — institution, participants, project type, loading

Read from PDF p.13 (AS, DS, IC), p.14 (PI, CY, ST, ZP, RE), p.15 (OC, PF, PT).
All Supplied stage except UD. Requiredness is the key result.

| Tag | Elem | Char | Length | Rep | Always | Model field | Check |
|---|---|---|---|---|---|---|---|
| AS | 3 | A | MAX 4 | N | **N** | `agency` Option | agrees |
| DS | 4 | A,N | MAX 4 | N | **N** | `division_station` Option | agrees |
| IC | 6 | N | MAX 6 MIN 4 | N | **N** | `institution_code` Option | agrees |
| PI | 7 | A,N | MAX 40 | N | **Y** | `institution_name` required | agrees |
| CY | 8 | A,N | MAX 20 | N | **Y** | `city` required | agrees |
| ST | 9 | A | MAX 20 | N | **Y** | `state_country` required | agrees |
| ZP | 10 | N | MAX 10 | N | **N** | `zip` Option | agrees |
| RE | 11 | N | Exact 1 | N | **N** | `region` Option | agrees; "absent for foreign countries" |
| OC | 12 | N | MAX 6 MIN 4 | N | **Y→N (hand)** | `organization_code` Option | agrees with the *amendment* |
| PF | 13 | A,N | MAX 40→**80 (hand)** | **Y** | N | `organization_names` List | agrees (repeating) |
| PT | 15 | A | MAX 20 | N | **N** | `project_type` Option | agrees |

- **Two more handwritten amendments**: OC's "Always Present" is printed **Y** and
  struck through to **N** by hand (and "may contain zeros" → "may be blank"); PF's
  length **40** is struck to **80** by hand. So `organization_code` being optional
  and `organization_names` allowing longer values both rest on
  **HandwrittenAmendment** grade. Note the model here follows the *handwritten* OC
  value (optional), the opposite of the FY case where the model does **not** follow
  the handwritten requiredness — a modeling inconsistency worth reconciling when
  the constructor is built. Recorded, not repaired.
- **PI required, but "may be address"**: PI Remarks say "usually name of
  performing institution, may be address of performing organization" — the value
  is required (Always Y) but its meaning is not fixed to a name. The model's
  required `institution_name` captures presence; the name-vs-address question is
  an open interpretation.
- **Adjacent** (CG 14, RG 16, RN 17, GY 28): transcribed and modeled in **batch
  6** below — they were the top unmodeled-material failures in the full-corpus
  `construct.project` run.

### UD — the loading stage (elem 49, p.23)
Printed tag cell reads "UD (Generated by DIALOG)"; A,N, **Exact 4**, Repeating N,
**Always Present Y**; Remarks "Date record is added to online (DIALOG) file;
**added by DIALOG at file loading**". This is the one field explicitly at the
**DialogLoaded** stage. **Model check**: `LoadedRecord.dialog_update` and the
`Stage` split (Supplied vs DialogLoaded) are vindicated — UD must not be enforced
against the supplied card image.

# Batch 6 — RN, CG, GY, RG (adjacency modeled)

Transcribed directly from the PDF page images (Opus, single reader) after the
full-corpus `construct.project` tally showed these four were the dominant
unmodeled-material failures (RN 6,962, CG/GY 5,267 each, RG 3,689 occurrences).
All four are **printed rows, Always Present N (optional), Repeating N**. Stage
Supplied. Cells read verbatim below; the modeling follows.

### CG — Contract/Grant/Agreement No. (element 14, PDF p.15)
Char **A,N**; Length **MAX 20**; Repeating N; **Always Present N**; Phrase; CG=;
Display CG; Sort CG; Remarks "Contract/grant/agreement number". Example
`58-7830-3-546` (hyphens — so A,N is not a literal `[A-Z0-9]` class, the
cross-cutting rule again). **Model**: `optional`, `upto(20)`, no char-class check.
Placed in `Institution` (`contract_grant`). Evidence: PrintedDictionary.

### RG — Regional Project Region (element 16, PDF p.15)
Char **A**; Length **MAX 2**; Repeating N; **Always Present N**; Phrase; RG=;
Display RG; Sort -; Remarks "Abbreviation for region". Example `NE`. Distinct from
**RE** (element 11, numeric region code, Exact 1) already modeled — RG is the
2-letter regional abbreviation. **Model**: `optional`, `upto(2)`. Placed in
`Institution` (`region_abbreviation`, kept separate from `region`/RE). Evidence:
PrintedDictionary.

### RN — Regional Project Number (element 17, PDF p.16)
Char **N**; Length **Exact 5**; Repeating N; **Always Present N**; Phrase; RN=;
Display RN; Sort -; Remarks "A five-digit numerical field; the second part of a
two part designation". Example `00153`. **Model**: `optional`, `exact(5)` —
length only, NOT a digit check (only AN is digit-checked, via `accession.parse`;
every other "N" field, e.g. the dates PD/SD/UP, is length-checked only — RN
follows that precedent). Placed in `Institution` (`regional_project_number`).
Evidence: PrintedDictionary.

### GY — Grant Year (element 28, PDF p.17)
Char **N**; Length printed **Exact 2** struck by hand to **4**; Repeating N;
**Always Present N**; Phrase; GY=; Display GY; Sort -; Remarks printed "Year of
grant award" + **handwritten** "Format is YYYY / may be blank". Example `1985`
(printed `85`, hand-prepended `19`). **GY is FY's exact twin**: printed two-digit
year widened to four digits by the same year-widening hand. **Model**: optional,
value length must equal **2 (printed YY) or 4 (handwritten YYYY)** — the same
dual-length rule as `fiscal_year`; matches-neither is a divergence. Placed in
`Chronology` (`grant_year`). Evidence: PrintedDictionary for Exact 2 / the
2-digit example; HandwrittenAmendment for the Exact-4 widening and "may be blank".

Scope: single-reader (Opus) transcription from the page images; the four printed
rows are low-ambiguity, GY's handwriting mirrors the already-established FY
amendment. FY94 unmeasured for these fields.

# Inventory status and next work

The inventory now covers **all fields the model touches**: identity (batch 1),
chronology (batch 2, + GY in batch 6), classifications/percentages/headings +
SC/SN (batch 3), narratives (batch 4), institution/participants/project-type +
the UD loading stage (batch 5), and the RN/CG/GY/RG adjacency (batch 6). Fields
present in the data or dictionary but **still not modeled** — SN (undocumented),
NI, HP, BP — are recorded as `FieldNotYetModeled` candidates, not silently
dropped.

The remaining work is no longer transcription; it is **building the checked
`Project` constructor** on these rules, field group by field group, accumulating
`ConstructionProblem`s. Two slices now exist and run over real data via
`src/formatb_reading.gleam` (see the README): `construct.identity` (AN, PN) and
`construct.institution`/`construct.participants` (PI/CY/ST required, AS/DS/IC/ZP/
RE/OC optional, PF repeating, IN 1..6), built on a reusable
`required`/`optional`/`repeating`/`bounded_nonempty` toolkit that the remaining
groups will share. Recommended remaining construction order, each backed by the
batch above:
1. ~~Institution/Participants presence + lengths~~ — **done** (batch 5 + IN).
2. ~~Chronology lengths/formats~~ — **done**. FY is **required** (printed Always
   Present Y) and honours **both** documented lengths — printed Exact 2 (YY) and
   the handwritten Exact 4 (YYYY); a value matching neither is a divergence (not
   silently accepted). Dates use their exact printed lengths. No date agreement is
   enforced. Decision (yours): honour the written contract, handle divergences —
   accepting one of two *documented* forms is not leniency. All field lengths now
   go through one `Length` type (`exact`/`upto`/`between`) so documented **MIN**
   bounds (IC/OC "MIN 4") are enforced too — a present-but-too-short value is a
   divergence. A lenient `≤max`-only model would have been indistinguishable from
   the TS parser; the discipline is the contribution.
3. Classifications — repetition + per-value lengths only; **no** tuple alignment,
   and SN/NI/HP as `FieldNotYetModeled`.
4. Narratives — optionality + MAX lengths.

Open disagreements the constructor must decide (recorded): whether to honour
handwritten requiredness (OC treated optional); PS/HP/HP-duplication handling;
the "A,N" character class, left unchecked throughout. **Resolved**: FY
required-vs-`Option` — reconciled to optional for FY88 on full-corpus evidence
(25.6% absence), see batch 2.
