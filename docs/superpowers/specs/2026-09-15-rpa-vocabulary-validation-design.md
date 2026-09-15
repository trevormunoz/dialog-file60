# RPA vocabulary extraction and vintage-scoped validation — design

- Date: 2026-09-15
- Status: approved (brainstorm), pending spec review
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
(Feb 1982), V (Feb 1993), VI (Dec 1998), and X (Jun 2025) of the manual, plus FY
1993–1996 annual tables. Revisions IV and V are the editions contemporary with the
FY88–FY94 corpora the validator already certifies.

This design lifts the gate for the **RP (Research Problem Area) column only**,
across **Revisions IV and V only**, as the first slice.

## Goals

- Turn the RPA code sets of Rev IV and Rev V into a citable, diffable dataset with
  per-code provenance — discharging two of the collection's `pending` member cards.
- Have the validator check a record's RP codes against the edition contemporary with
  the record's fiscal year, reporting a miss as a *statement of absence*, never a
  verdict of invalidity.
- Keep the vocabulary as authored data and the validator's copy as derived, so the
  check can never be more confident than the recorded provenance allows.

## Non-goals (this slice)

- The other six classification columns (AC/CM/FS/CT/PA/JC).
- Revisions VI and X, and the annual tables.
- Repairing or normalizing records. The validator accumulates typed problems; it
  never rewrites values.
- Any runtime file I/O from the Gleam validator. The vocabulary reaches it as a
  compiled module.

## Settled decisions

1. **Dataset-first (not embed).** The vocabulary is a standalone dataset; the
   validator consumes a compiled copy. Rationale: the repo's discipline is
   per-rule documentary citation; the dataset *is* the warrant in citable form,
   and it is the diffable historical artifact the RO-Crate was assembled to
   produce.
2. **First slice: Rev IV + Rev V, RPA only.** Covers the FY88–FY94 span precisely
   and enables an IV→V diff.
3. **Miss = graded "not attested" finding**, carrying the edition and the
   extraction method — a statement of absence, not `InvalidFieldValue`.
4. **Dataset home: `registry/vocab/rpa-*.json`**, one file per edition, folded into
   `__REGISTRY_HASH__`; `registry/evidence.json`'s keyed-scalar shape is left
   untouched.
5. **Vintage map: strict FY→edition.** FY88–FY92 → Rev IV; FY93–FY94 → Rev V. A
   miss names the edition so a reader can judge lag-coding themselves.
6. **Verification is a required stage** built on dual independent witnesses, with a
   human-adjudication *residue count* as a reconsider-checkpoint.

## Architecture

```
manuals (PDF / GLM / WPD)  ──extract──▶  registry/vocab/rpa-*.json  ──codegen──▶  src/vocab_rpa.gleam  ──▶  construct.gleam leaf-check
      [documentary]                          [citable dataset]                     [derived, compiled]        [checked construction]
```

Four separable units:

1. **Extract** — throwaway Python/shell (per the project's Gleam=rules /
   Python=forensics boundary), kept in scratchpad; only its committed *output* is
   the dataset. Produces `code → label → page` per witness.
2. **Dataset** — `registry/vocab/rpa-rev-iv-1982.json`,
   `registry/vocab/rpa-rev-v-1993.json`. Source of truth, human-diffable.
3. **Codegen** — a build step (mirroring the existing "build the bundle before
   test/typecheck" gate) reads the JSON and generates a Gleam module. The JSON is
   authored; the Gleam is derived and never hand-edited.
4. **Leaf-check** — in `construct.gleam`, the RP-column constructor looks up each
   code against the FY-selected edition set; a miss emits the new problem type.

The only new architectural edge — the Gleam validator depending on `registry/` — is
**build-time only**. At runtime the validator reads a generated Gleam module, exactly
as it reads today's hand-cited constants. This matches how `__REGISTRY_HASH__` already
binds registry state into the build; it does not introduce a runtime read.

## The dataset

One file per edition. Row schema:

```json
{
  "code": "101",
  "label": "Appraisal of Soil Resources",
  "source_page": 39,
  "method": "pdftotext-layout" | "glm-ocr-audited",
  "evidence_grade": "PrintedDictionary"
}
```

File header block, per edition: edition, issue date, source file + SHA-256 (already
recorded in the collection card), extraction date, and a **generated** `coverage`
claim — the GOAL ranges and code count actually captured, computed from the rows,
never hand-typed. The generated coverage claim is what makes every downstream miss a
defensible statement of absence: a reader can see exactly what was searched.

Rev IV and Rev V get **separate** files even though both are nominally GOAL I–IX /
RPA 101–908, because the reason for holding both is that membership and labels may
have drifted; the dataset must show drift, not assume identity.

## Extraction method

- **Rev V (1993), born-digital:** `pdftotext -layout` over the PDF. The `-layout`
  flag is required — default reading-order flow collapses the two-column code|label
  layout into interleaved text (the same failure mode the IA OCR had on Rev IV).
- **Rev IV (1982), scan:** parse the already-audited `manual-rev-iv-1982.glm.md`
  (GLM re-OCR, which linearizes the two-column layout the embedded IA layer
  scrambles).

## Verification stage (required)

The design's honesty depends entirely on extraction being complete and correct and on
each file's coverage claim being true. Verification is therefore a first-class,
required stage — **not a spot-check**. It is built on the fact that every edition
already has two independent text witnesses in the RO-Crate.

- **Rev IV — two OCR layers:** the embedded Internet Archive OCR **and** the project
  GLM re-OCR. Extract RPA from both independently; diff.
- **Rev V — two born-digital sources:** the PDF text layer **and** the WordPerfect
  `.wpd` alternate. Extract from both; diff. (This is where the `.wpd` the collection
  card retained "as the second original format" earns its keep — as Rev V's second
  witness.)

Stage steps:

1. **Dual-witness extraction** — two `code → label → page` extractions per edition.
2. **Automated diffs** — flag: (a) codes in one witness but not the other; (b) label
   mismatches between witnesses; (c) gaps / out-of-range codes within a GOAL's
   expected contiguous range; (d) a **cross-edition** IV↔V diff — near-identity is
   expected, so each difference is either real drift (record) or an extraction bug
   (fix).
3. **Label integrity pass** — spell/dictionary flag on labels (`chemosteri1ants`,
   `Swi ne`). Codes are three digits; labels are the OCR-fragile part.
4. **Bounded human adjudication** — a person reviews *only the residue*: diff
   disagreements, spell flags, and each GOAL's boundary codes (first/last, page-break
   rows) — against the page image for Rev IV. Not all ~200 codes.
5. **Generated coverage claim** — computed from the extracted rows so it cannot
   overstate what was captured.
6. **Golden fixtures + provenance gate** — the verified sets are frozen as test
   fixtures asserting count, ranges, and a sample of `code → label` pairs; a build
   check fails if any row lacks page/method/grade.

**Residue checkpoint.** The stage reports the count of codes requiring human eyeballs
(the residue of steps 2–3). If that count is high, stop and reconsider the approach
before grinding through adjudication. Threshold to be set at implementation from the
first real diff; the point is that the number is measured and gates the work, not
assumed.

## Validator integration

- **New problem type** in the validator's typed-problem set, e.g.
  `RpaCodeNotAttested { code, edition, method }`. Distinct from `InvalidFieldValue`.
  Rendered as, e.g., "RPA 514 not attested in Rev V (1993) RPA set
  (pdftotext-layout)".
- **FY→edition selection** is data-driven: a small mapping (FY88–92 → Rev IV, FY93–94
  → Rev V) chooses which generated set to look up against. Adding Rev VI later is a
  new file and a new mapping row, not a change to the check.
- **Generated module** `src/vocab_rpa.gleam` exposes each edition's set plus its
  provenance, generated from `registry/vocab/rpa-*.json`. Regeneration is wired into
  the same gate that builds the bundle before test/typecheck, so the compiled set
  cannot silently drift from the JSON.

## Testing

- **Gleam (gleeunit):** the leaf-check — a known code passes; an unknown code emits
  `RpaCodeNotAttested` with the correct edition for the FY; the FY→edition boundary
  selects the right set; provenance fields are populated.
- **Codegen:** golden test that the generated module matches the JSON (fails if
  stale).
- **Dataset fixtures:** count/range/sample assertions per edition (guards against
  silent vocabulary corruption).
- **TS side:** unchanged; the reader stays structural. No parity impact.

## Known flaws and mitigations

Carried from brainstorming, recorded so they are not silently forgotten.

1. **The check may rarely fire; the dataset is the larger value.** RPA is stable
   IV→V. Mitigation: weight effort toward extraction quality and the cross-edition
   diff, which *generates* signal RPA's stability otherwise hides. The dataset (member
   cards, IV→V→VI comparison substrate) is a first-class deliverable, not plumbing.
2. **A "look-certain" mechanism on a soft OCR foundation.** Mitigated by dual-witness
   verification: a bad Rev IV code must survive both IA and GLM agreeing wrongly *and*
   the cross-edition diff against clean Rev V.
3. **The FY→edition boundary is a knife-edge where practice lags.** Records coded
   under Rev IV can appear in FY93. Mitigation: the miss names the edition; the IV↔V
   diff tells us exactly which codes differ, so boundary noise is located, not
   guessed. Residual risk accepted for this slice.
4. **Even a humble finding gets read as an error.** Mitigation: naming the problem
   type "not attested" and rendering it with the searched scope. Residual risk that
   users over-correct is accepted and revisited if the finding proves noisy.
5. **RPA is a weak *test* of the mechanism even as the right *product*.** Mitigation:
   the cross-witness and cross-edition diffs exercise the drift machinery regardless
   of RPA's stability.
6. **Codegen can go stale.** Mitigation: regeneration wired into the pre-test/typecheck
   gate; a golden test fails on drift.
7. **One-edition-per-record assumes clean single-vintage coding.** Mixed-vintage
   records (projects spanning the 1993 cutover) cannot be represented. Accepted as
   rare for this slice; noted for later.

The thread through 2/3/5: honesty depends on complete extraction and true coverage
claims — which is why verification is a required stage, not a footnote.

## Out of scope / later slices

- Remaining six classification columns.
- Revisions VI and X (Rev VI's Topic-Area restructure is a distinct mapping problem).
- Annual tables (financial data, not vocabulary).
- Mixed-vintage record handling.
