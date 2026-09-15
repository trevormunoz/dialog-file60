# RPA vocabulary extraction and vintage-scoped validation — design

- Date: 2026-09-15
- Status: revised after adversarial + idiom review; pending spec re-review
- Branch: `worktree-rpa-vocab-validator`
- Supersedes gate: the "1982 Manual of Classification is not in hand" blocker recorded in
  `packages/cris-formatb/rules/field-rule-inventory.md` and the package README.

## Context

The CRIS Format B validator (`packages/cris-formatb/src/construct.gleam`) performs
structural and lexical checks only — requiredness, repetition, byte lengths,
occurrence caps, the accession digit check. It deliberately does **not** check
classification-code *values* (the seven columns AC/CM/FS/RP/CT/PA/JC) against any
allowed set. The repo holds a standing rule against building closed enums from
example values without documentary warrant, and the field-rule inventory names the
missing warrant explicitly: the Manual of Classification was not in hand.

It is now in hand. The `cris-classification-manuals` RO-Crate supplies Revisions IV
(Feb 1982), V (Feb 1993), VI (Dec 1998), and X (Jun 2025) of the manual, **and four
CRIS annual summary tables (FY 1993–1996)** whose "Table D" enumerates the RPA code
set in force *that fiscal year*, in clean born-digital fixed-column text.

This design lifts the gate for the **RP (Research Problem Area) column only**, for the
FY88–FY94 corpora the validator already certifies.

## Warrant model (what a record's RPA is checked against)

A record's RP codes are checked against the RPA set that is best warranted for that
record's fiscal year. Warrant is chosen to prefer an **independently authored,
same-year** source over the manual where one exists:

| Corpus FY | Warrant set | Source | Strength |
|---|---|---|---|
| FY88–FY92 | Rev IV RPA set | 1982 manual, GLM-OCR | Weakest — OCR closure, no same-year cross-source |
| FY93 | FY93 annual-table RPA set | born-digital fixed-column | Strong — same-year, independently authored |
| FY94 | FY94 annual-table RPA set | born-digital fixed-column | Strong — same-year, independently authored |

Rev V (Feb 1993) is **not** a warrant set for any corpus year — the same-year tables
supersede it for FY93–FY94 and it postdates FY88–FY92. It is extracted anyway, for two
reasons: it is an **independent authored witness** used to verify the FY93/FY94 table
extractions (see Verification), and the Rev IV→Rev V diff is the historical artifact
that discharges two `pending` member cards.

This warrant model directly answers the FY-boundary anachronism: Rev V did not exist
for the first ~4½ months of federal FY93 (which begins Oct 1992), so mapping FY93 to
the Feb-1993 manual was backwards; the same-year FY93 table sidesteps the manual's date
entirely.

**Residual, stated openly:** fiscal year is a coarse proxy for coding vintage — an RPA
code is assigned at project classification, which can predate the snapshot's FY by
years. And FY88–FY92 have no same-year table, so that segment leans on the OCR'd Rev IV
set, the weakest warrant. Both facts are surfaced (see Known weaknesses); neither is
silently load-bearing.

## Goals

- Turn the RPA code sets of Rev IV, Rev V, and the FY93/FY94 annual tables into a
  citable, all-facts dataset with per-code provenance — discharging `pending` member
  cards.
- Check a record's RP codes against the warrant set for its fiscal year, reporting a
  miss as a *statement of absence* naming the set and how it was extracted — never a
  verdict of invalidity.
- Keep the vocabulary as authored data and the validator's copy as derived, so the
  check can never be more confident than the recorded provenance allows.

## Non-goals (this slice)

- The other six classification columns (AC/CM/FS/CT/PA/JC).
- Revisions VI and X, and the FY95/FY96 tables (no matching corpus records).
- The financial content of the annual tables (funds, scientist-years). Only Table D's
  RPA code/label enumeration is extracted.
- Repairing or normalizing records. The validator accumulates typed problems; it never
  rewrites values.
- Any runtime file I/O from the Gleam validator. The vocabulary reaches it as a
  compiled module.

## Architecture

```
manuals + tables  ──extract──▶  registry/vocab/rpa-*.json  ──codegen──▶  src/vocab_rpa.gleam  ──▶  construct.gleam leaf-check
   [documentary]                    [citable dataset]                     [derived, compiled]        [checked construction]
```

Four separable units:

1. **Extract** — throwaway Python/shell (per the project's Gleam=rules /
   Python=forensics boundary), kept in scratchpad; only its committed *output* is the
   dataset. Produces `code → label → source_page` per witness.
2. **Dataset** — `registry/vocab/rpa-rev-iv-1982.json`, `rpa-rev-v-1993.json`,
   `rpa-fy93-table.json`, `rpa-fy94-table.json`. Source of truth, human-diffable.
3. **Codegen** — a build step reads the JSON and generates a Gleam module. The JSON is
   authored; the Gleam is derived and never hand-edited.
4. **Leaf-check** — in `construct.gleam`, the RP-column constructor normalizes each
   value and looks it up against the FY's warrant set; a miss routes a typed problem.

The only new architectural edge — the Gleam validator depending on `registry/` — is
**build-time only**. At runtime the validator reads a generated Gleam module, exactly
as it reads today's hand-cited constants.

## The dataset (all facts, no interpretive grade)

One file per source. Row schema:

```json
{ "code": "101", "label": "Appraisal of Soil Resources", "source_page": 39, "method": "glm-ocr-audited" }
```

`method` is one of `glm-ocr-audited` | `pdftotext-layout` | `annual-table` — a
self-describing fact about how the code was recovered. There is **no `evidence_grade`
field**: a graded confidence tier rots once the legend is forgotten, whereas the method
is legible without a codebook. The judgment of how much to trust each method lives at
the point of use (the validator's rendering and, if ever needed, weighting), where it
is explicit and revisable — not frozen into 200 data rows. The rule-level
`EvidenceGrade`/`RuleRef` discipline is untouched; it stays on the *rule* in
`construct.gleam`, keeping the two axes from conflating.

File header block, per source: source identity, issue/fiscal date, source file +
SHA-256 (already recorded in the collection card), extraction date, and a **searched
scope** claim — the page/section range actually examined for codes (e.g. "Rev IV pp.
39–72, GOAL I–IX section"), computed from the extraction pass. The searched scope, not
the found min/max, is what bounds a downstream absence: a reader can see *what was
looked through*, per the statement-of-absence discipline. (The found min/max alone
would be circular — it cannot reveal a code dropped from inside the range.)

Rev IV and Rev V get **separate** files even though both are nominally GOAL I–IX / RPA
101–908, because the reason for holding both is that membership and labels may have
drifted; the dataset must show drift, not assume identity.

## Extraction method

- **Rev V (1993), born-digital:** `pdftotext -layout` over the PDF. The `-layout` flag
  is required — default reading-order flow collapses the two-column code|label layout
  into interleaved text.
- **Rev IV (1982), scan:** parse the audited `manual-rev-iv-1982.glm.md` (GLM re-OCR).
- **FY93/FY94 tables, born-digital:** parse Table D's fixed-column rows (`NNN LABEL …`)
  from the annual-table text, stopping at `Goal Total` subtotal lines.

## RP value normalization contract (required — was missing)

The RP column *value* in the corpus is **not** a bare 3-digit code. Per
`field-rule-inventory.md:769`, a real value is `R101` — the column letter `R` followed
by the 3-digit RPA code (RP is `A,N`, MAX 74 MIN 4, repeating, up to 15 codes). The
manual and tables enumerate the bare `101`. The leaf-check therefore must:

1. Split the RP field into its up-to-15 repeated code values (existing reading layer).
2. For each value, require a leading `R`; strip it to obtain the 3-digit lookup key.
   A value that does not match `R` + 3 digits is a *shape* problem (existing
   `InvalidFieldValue`/length machinery), not a "not attested" — the two are distinct.
3. Look the 3-digit key up against the FY's warrant set.

Without this contract every real RP value (`R101`) would miss against every manual code
(`101`) and the check would flag 100% of records. The contract is stated here because
its omission was the single largest defect in the prior draft.

## Codegen and the lookup representation

Codegen emits, per warrant set, a **pure `case` function** — not a `Dict`:

```gleam
pub fn rev_iv_label(code: String) -> Result(String, Nil) {
  case code {
    "101" -> Ok("Appraisal of Soil Resources")
    // … generated …
    _ -> Error(Nil)
  }
}
```

Rationale (from Gleam idiom review): a Gleam `const` cannot hold a `Dict`
(`dict.from_list` is a function call — compile error), and building a dict per record
would be an O(n) JS-target cost. A generated `case` gives membership *and* label in one,
with zero runtime construction, and is the natural codegen output at ~200 rows on the JS
target. The generated file is run through `gleam format` so it passes the package format
gate.

**Staleness (the guarantee must not be circular):** the generated module is **committed**,
and CI regenerates it and runs `git diff --exit-code` on the generated path. If a JSON
edit was not accompanied by regeneration, the diff is non-empty and CI fails. (A golden
test that regenerates *then* compares to itself cannot catch this — it compares fresh
output to fresh output.) This closes JSON↔generated drift. JSON↔manual drift — a later
correction to the RO-Crate — is **not** closed by this and is not claimed to be; a
corrected manual requires re-running extraction, noted as an operational step.

## Validator integration

- **New problem kind** as a labelled `DisagreementKind` variant routed through the
  existing `FormatDisagreement` envelope — matching how `construct.gleam` already models
  value divergences, rather than a new top-level `ConstructionProblem` variant. The
  variant carries only what the envelope does not: `RpaCodeNotAttested(code: String,
  warrant_set: String)` — where `warrant_set` is the set's label ("Rev IV", "FY94
  table"), since warrant sets now include tables as well as editions. `method`, `rule`
  (`RuleRef`), and `examined` (`Location`) are the envelope's existing fields — not
  duplicated into the variant.
- **Naming:** the envelope is named "Disagreement," which sits awkwardly with "statement
  of absence, not a verdict." Resolved by the rendered wording, which is explicitly
  provisional and names the searched set + method: e.g. *"RPA 514 not attested in the
  FY94 RPA set (annual-table)."* The type name is internal; the rendered finding is what
  a reader sees.
- **FY→warrant selection** is a pure `case` on an `Edition`/`WarrantSet` sum type with
  guards (Gleam has no integer range patterns): `case fy { n if n >= 88 && n <= 92 ->
  RevIv; 93 -> Fy93Table; 94 -> Fy94Table; … }`. Adding a later year is a new arm, not a
  structural change.
- **Generated module** `src/vocab_rpa.gleam` exposes one `case` function per warrant set
  plus its searched-scope/provenance header, generated from `registry/vocab/rpa-*.json`.

## Verification stage (required) — honest about witness independence

The design's honesty depends on extraction being complete and the searched-scope claim
being true. Verification is a first-class, required stage. The prior draft claimed "two
independent witnesses per edition"; review showed that overclaims. The corrected stance:

- **Rev IV — two OCR *engines* over one scan.** IA-OCR and GLM re-OCR read the *same
  page images*. Their diff catches engine-specific error (layout scrambling, some
  character slips) but **not** correlated error: where the 1982 scan is faint or damaged,
  both engines can drop or misread the same row. Agreement is therefore *not* proof of
  correctness. The genuinely independent check for Rev IV is the **human audit against
  the page images** (step 4), plus the cross-edition and cross-source diffs below.
- **Rev V — PDF and `.wpd` are one authored source in two formats**, almost certainly
  the PDF exported from the WordPerfect file (the card calls the `.wpd` "the second
  original format"). Their agreement verifies **export/extraction fidelity only** (it
  catches `pdftotext` glitches), not faithfulness to the manual. It is a format
  cross-check, not an independent transcription witness.
- **The annual tables are the one independently authored source.** Table D of the FY93
  table was authored separately from the Rev V manual, so agreement between the FY93
  table RPA set and the Rev V manual RPA set is *real* cross-source evidence. This is why
  the tables carry the FY93/FY94 warrant and why Rev V is extracted as their witness.

Stage steps:

1. **Multi-source extraction** — Rev IV (IA + GLM), Rev V (PDF + WPD), FY93 table, FY94
   table; each `code → label → source_page`.
2. **Automated diffs** — flag: (a) IA↔GLM disagreements (Rev IV); (b) PDF↔WPD
   disagreements (Rev V, fidelity only); (c) **cross-source** FY93-table↔Rev-V and
   FY93↔FY94 table diffs (the independent checks); (d) cross-edition Rev IV↔Rev V diff.
   Note: the annual tables enumerate codes **contiguously with `Goal Total` subtotals**,
   so within-table completeness *can* be checked by contiguity and subtotal reconciliation
   — unlike the sparse manual, where contiguity gap-detection does not work and is not
   relied on.
3. **Label integrity pass** — flag OCR-corrupt tokens (`chemosteri1ants`) in Rev IV.
   Note: a general dictionary false-flags agricultural/scientific terms heavily, so this
   is a recall aid for human review, not a gate; its flags feed the residue count.
4. **Bounded human adjudication** — a person reviews *only the residue*: all diff
   disagreements, label flags, and each GOAL's boundary codes (first/last, page-break
   rows) — against the Rev IV page images. Not all ~200 codes.
5. **Searched-scope claim** — computed from the extraction pass (pages/sections
   examined), recorded in each file header. This is what scopes every downstream absence.
6. **Golden fixtures + provenance gate** — the verified sets are frozen as test fixtures
   asserting count, ranges, and a sample of `code → label`; a build check fails if any
   row lacks `source_page`/`method`.

**Residue checkpoint.** The stage reports the count of codes requiring human eyeballs
(residue of steps 2–3). If that count is high, stop and reconsider the approach before
grinding through adjudication. Threshold set from the first real diff; the point is the
number is measured and gates the work.

## Closed-set-over-absence — acknowledged limit

A "not attested" finding is a *closure* claim (no other code is valid for that set),
stronger than the manual's *inclusion* warrant (these codes exist). For the born-digital
same-year tables the closure is well supported (clean text, contiguity + subtotal
checks). For **OCR'd Rev IV** the closure boundary is set by extraction completeness, not
by the document — a dropped code silently narrows the set and a legitimate record using
it reads "not attested." This is mitigated, not eliminated: cross-source diffs, human
boundary audit, and the method surfaced inline (`glm-ocr-audited`) so a reader weights the
FY88–FY92 findings accordingly. Consistent with the absence discipline, every such
finding is provisional and scoped to the searched range.

## Testing

- **Gleam (gleeunit), `should.*` + `_test`, existing `record(...)` fixture:** the
  leaf-check — a known code passes; an unknown code yields `RpaCodeNotAttested` with the
  correct set for the FY; `R`-prefix normalization (a real `R101` value passes, a bare
  `101` or malformed value is a shape problem, not "not attested"); the FY→warrant guard
  selects the right set at boundaries (FY92→RevIv, FY93→Fy93Table).
- **Codegen:** CI `git diff --exit-code` on the generated module after regeneration.
- **Dataset fixtures:** count/range/sample assertions per source.
- **TS side:** unchanged; the reader stays structural. No parity impact.

Note on what the runtime check exercises: on *clean* records the leaf-check is near-inert
(RPA is stable, records are mostly well-coded). The unit tests exercise its paths with
synthetic out-of-set values; the *real* discovery value of this slice is in the dataset
and the cross-source diffs, not in findings against the corpus. Stated so the check's
build-gate cost is weighed against its actual, modest runtime yield.

## Known weaknesses (residual, after fixes)

1. **The runtime check is near-inert on this slice.** RPA is stable; value lands in the
   dataset and diffs. Accepted; the check is still the documented gate and cheap once the
   dataset exists.
2. **FY88–FY92 lean on OCR'd Rev IV** — the weakest warrant (closure over OCR, no
   same-year cross-source). Mitigated by cross-edition diff + human audit + inline method;
   not eliminated.
3. **Fiscal year is a coarse proxy for coding vintage** — codes are assigned at
   classification, possibly years before the snapshot FY. The warrant map is a heuristic;
   the finding wording is provisional accordingly.
4. **Rev IV continuous force (1982–1993) assumed** — no intermediate edition between IV
   and V is modeled. Attested elsewhere; accepted for this slice.
5. **One warrant set per record** — mixed-vintage records (projects spanning the 1993
   cutover) are not represented. Accepted as rare; noted.
6. **JSON↔manual drift is open** — a later RO-Crate correction requires re-running
   extraction; only JSON↔generated drift is closed by CI.

## Out of scope / later slices

- Remaining six classification columns (each has its own column-letter prefix — `A`,
  `C`, `F`, `P`, `J` — so the normalization contract generalizes).
- Revisions VI and X (Rev VI's Topic-Area restructure is a distinct mapping problem).
- FY95/FY96 tables; earlier same-year tables if located (would strengthen FY88–FY92).
- Mixed-vintage record handling.

## Revision note

This spec was revised after a parallel adversarial review pair and a Gleam idiom review.
Material changes from the first draft: added the RP `R`-prefix normalization contract
(previously omitted — would have flagged 100% of records); brought the FY93/FY94 annual
tables into scope as same-year warrant + the one independently authored verification
witness; corrected the "two independent witnesses" overclaim (OCR engines share the scan;
Rev V PDF/WPD share an author); replaced the interpretive `evidence_grade` with a factual
`method`; changed the coverage header from found-set to searched-scope; pinned the lookup
to a generated `case` function (not a `Dict`) and the staleness check to committed-module
+ `git diff` (not a circular golden test); routed the finding through the existing
`FormatDisagreement` envelope; and reframed the FY→edition map around the FY93
anachronism.
