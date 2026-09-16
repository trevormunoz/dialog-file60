# RPA vocabulary extraction and vintage-scoped validation — design

- Date: 2026-09-15
- Status: revised after two adversarial review rounds + a forensic OCR measurement; pending spec re-review
- Branch: `worktree-rpa-vocab-validator`
- Supersedes gate: the "1982 Manual of Classification is not in hand" blocker recorded in
  `packages/cris-formatb/rules/field-rule-inventory.md` and the package README.

## Context

The CRIS Format B validator (`packages/cris-formatb/src/construct.gleam`) performs
structural and lexical checks only — requiredness, repetition, byte lengths, occurrence
caps, the accession digit check. It deliberately does **not** check classification-code
*values* (the seven columns AC/CM/FS/RP/CT/PA/JC) against any allowed set. The repo holds
a standing rule against building closed enums from example values without documentary
warrant, and the field-rule inventory names the missing warrant explicitly: the Manual of
Classification was not in hand.

It is now in hand. The `cris-classification-manuals` RO-Crate supplies Revisions IV (Feb
1982) and V (Feb 1993) of the manual, and CRIS annual summary tables (FY 1993–1996) whose
"Table D" enumerates the RPA code set in force that fiscal year, in clean born-digital
fixed-column text.

This design lifts the gate for the **RP (Research Problem Area) column only**, for the
**certified** FY88/FY89/FY94 corpora (see Warrant model). It is the first slice; the other
six columns, later editions, and other years follow separately.

## What the RPA set actually is (measured)

A forensic pass (2026-09-15, scratchpad) extracted the RPA code set from four sources — Rev
IV GLM-OCR, Rev IV embedded IA-OCR, Rev V born-digital, and FY93 Table D — and diffed them:

- **98 RPA codes**, identical across all four sources. The `101–908` range is **sparse**
  (only 98 codes exist in it), so gap-in-range is *not* evidence of a dropped code.
- **100% code agreement** on every pairwise diff (GLM↔IA-OCR, GLM↔Rev V, GLM↔Table D);
  **zero** code-level disagreements.
- **Zero** corrupted GLM labels; the only OCR artifact is a strippable trailing dot-leader
  on 64 labels. The label differences that exist between editions are real IV→V taxonomy
  drift (e.g. Rev V inserts ", Fish," into nine animal RPAs), not OCR error.

**Consequence for the design:** OCR fidelity for the RPA *code* set is a measured
non-issue, not an assumed risk. The prior draft's "OCR might drop codes / labels are the
fragile part" language is replaced by this measurement. Note precisely what the agreement
does and does not establish: it establishes **transcription fidelity** (the four sources
transcribe the same code list), which is all the validator needs. It does *not* establish
that the underlying taxonomy is "true" independently — all four descend from one official
CRIS classification, so they are common-cause, not independent witnesses to truth. Truth of
the taxonomy is not the validator's question; faithful transcription of it is, and that is
what was measured.

**Statement of absence (scoped):** "no OCR digit-slip or dropped code" is bounded to the
summary/TOC enumeration (and Table D data rows) actually read in each of the four sources —
not every in-body RPA cross-reference. It stands for the published code list, which is
exactly what a vocabulary validator loads.

## Warrant model (what a record's RPA is checked against)

Warrant is chosen per fiscal year, preferring a same-year source where one exists. The slice
is scoped to the corpora the base validator has **certified** — FY88, FY89, FY94 (per the
package README; FY90/FY91/FY93 are held out and are **not** in this slice):

| Corpus FY | Warrant set | Source | Strength (a fact, not a grade) |
|---|---|---|---|
| FY88, FY89 | Rev IV RPA set | 1982 manual, GLM-OCR | OCR-transcribed (measured 100% agreement) |
| FY94 | FY94 annual-table RPA set | born-digital fixed-column | Same-year, clean born-digital text |

Rev V (Feb 1993) is **not** a warrant set for any corpus year in this slice. It is extracted
anyway for the Rev IV→Rev V diff — the historical artifact that discharges two `pending`
member cards — and as a transcription cross-check on the FY94 table.

**FY93 is deliberately excluded** (was in a prior draft): it is held out / uncertified by the
base validator, and Rev V (its nominal manual) is dated Feb 1993 — mid-federal-FY93 — so the
publication-date anachronism landed exactly there. It returns as a later slice once the base
reader certifies it.

**Residual, stated openly:** fiscal year is a coarse proxy for coding vintage — an RPA code
is assigned at project classification, which can predate the snapshot FY by years. The
warrant map is a heuristic; findings are worded provisionally (below). Not silently
load-bearing.

## Goals

- Turn the RPA code sets of Rev IV, Rev V, and the FY94 annual table into a citable,
  all-facts dataset with per-code provenance — discharging `pending` member cards.
- Check a certified record's RP codes against the warrant set for its corpus fiscal year,
  reporting a miss as a *statement of absence* naming the set and how it was extracted —
  never a verdict of invalidity.
- Keep the vocabulary as authored data and the validator's copy as derived, so the check can
  never be more confident than the recorded provenance allows.

## Non-goals (this slice)

- The other six classification columns (AC/CM/FS/CT/PA/JC).
- Revisions VI and X; FY93 and the FY95/FY96 tables; uncertified corpora.
- The financial content of the annual tables. Only Table D's RPA code/label enumeration is
  extracted.
- Repairing or normalizing records. The validator accumulates typed problems; it never
  rewrites values.
- Runtime file I/O from the Gleam validator. The vocabulary reaches it as a compiled module.

## Architecture

```
manual + table  ──extract──▶  registry/vocab/rpa-*.json  ──codegen──▶  src/vocab_rpa.gleam  ──▶  construct.gleam leaf-check
  [documentary]                  [citable dataset]                     [derived, compiled]        [checked construction]
```

1. **Extract** — throwaway Python/shell (Gleam=rules / Python=forensics boundary), kept in
   scratchpad; only its committed *output* is the dataset.
2. **Dataset** — `registry/vocab/rpa-rev-iv-1982.json`, `rpa-rev-v-1993.json`,
   `rpa-fy94-table.json`. Source of truth, human-diffable.
3. **Codegen** — a build step reads the JSON and generates a Gleam module (authored JSON →
   derived Gleam, never hand-edited).
4. **Leaf-check** — in `construct.gleam`, the RP-column constructor best-effort-normalizes
   each value and looks it up against the corpus-FY warrant set; a miss routes a typed
   problem.

The only new architectural edge — the Gleam validator depending on `registry/` — is
**build-time only**. At runtime the validator reads a generated Gleam module.

## The dataset (all facts, no interpretive grade)

One file per source. Row schema:

```json
{ "code": "101", "label": "Appraisal of Soil Resources", "source_page": 39, "method": "glm-ocr-audited" }
```

`method` ∈ `glm-ocr-audited` | `pdftotext-layout` | `annual-table` — a self-describing fact
about how the code was recovered. There is **no `evidence_grade` field on the row**: a graded
confidence tier rots once the legend is forgotten, whereas the method is legible without a
codebook. The judgment of how much to trust each method lives at the point of use.

File header, per source: source identity, issue/fiscal date, source file + SHA-256, extraction
date, and a **searched-scope** claim — the page/section range actually examined (e.g. "Rev IV
TOC pp. 39–72, GOAL I–IX") plus the extracted code count (measured: 98). Searched-scope, not
the found min/max, is what bounds a downstream absence.

Rev IV and Rev V get separate files: holding both exists to show IV→V drift, so the dataset
must show it, not assume identity.

## Extraction method

- **Rev V, born-digital:** `pdftotext -layout` (the flag is required — default flow scrambles
  the two-column code|label layout).
- **Rev IV, scan:** parse the audited `manual-rev-iv-1982.glm.md` (GLM re-OCR). Strip the
  cosmetic trailing dot-leader on labels.
- **FY94 table, born-digital:** parse Table D's fixed-column `NNN LABEL …` rows, excluding
  `Goal Total` subtotal lines and the `990 UNCLASSIFIED` bucket.

## RP value normalization contract (best-effort, adds no new reject)

The RP column *value* is not a bare 3-digit code: per `field-rule-inventory.md:769`, an
observed value is `R101` — column letter `R` then the 3-digit RPA code. The manual and tables
enumerate the bare `101`. Normalization is therefore required for lookup, but it must **not**
introduce a new shape rule — the only warrant for the `R###` form is a single FY88-scoped
worked example, and the existing RP rule is `between(4, 74)` (`construct.gleam:579`), which
asserts nothing about a prefix. So the contract is:

1. Split the RP field into its repeated values (existing reading layer; up to 15 codes).
2. For each value, **best-effort** extract a canonical 3-digit key: strip a single leading
   `R` if present, then take the code if what remains is exactly 3 digits.
3. If a canonical key is extracted, look it up against the warrant set. If it cannot be
   extracted (no `R`, wrong digit count, unexpected shape), **skip the attestation check for
   that value** — emit no finding. Shape is already the province of the existing
   length/char machinery; the attestation check does not add a stricter shape gate, and a
   value it cannot canonicalize is never reported as "not attested."

Without step 2 every real `R101` would miss against every manual `101` and the check would
flag 100% of records. Step 3 keeps the check from inventing an undocumented shape rule.

## Codegen and the lookup representation

Codegen emits, per warrant set, a **pure `case` function** — not a `Dict` (a Gleam `const`
cannot hold `dict.from_list`; building a dict per record would be O(n) on the JS target):

```gleam
pub fn rev_iv_label(code: String) -> Result(String, Nil) {
  case code {
    "101" -> Ok("Appraisal of Soil Resources")
    // … 98 arms …
    _ -> Error(Nil)
  }
}
```

Membership and label in one, zero runtime construction. The generated file is run through
`gleam format`.

**Staleness — wired to the gate that already exists.** The package already runs a
`pretest`/`pretypecheck` step that builds the bundle (commit `9355f9b`). Regeneration of the
vocab module and a `git diff --exit-code` on its committed path hook into that same gate: if a
JSON edit was not accompanied by regeneration, the diff is non-empty and the gate fails. (A
golden test that regenerates *then* compares to itself cannot catch this.) This closes
JSON↔generated drift locally, at the same point the bundle boundary is already enforced — it
does not depend on CI infrastructure the repo lacks. JSON↔manual drift (a later RO-Crate
correction) is not closed by this and is not claimed to be; it requires re-running extraction.

## Validator integration

- **New `DisagreementKind` variant** routed through the existing `FormatDisagreement` envelope
  (how `construct.gleam` already models value divergences): `RpaCodeNotAttested(code: String,
  warrant_set: String)` — where `warrant_set` is the set's label ("Rev IV", "FY94 table").
  `rule` (`RuleRef`) and `examined` (`NonEmpty(Location)`) are the envelope's existing fields.
- **Surfacing the extraction method in the finding** (the honesty mechanism must be *built*,
  not asserted): the rendered wording derives the warrant set's `method` from the generated
  module's per-set header via the `warrant_set` label — it does **not** overload the
  envelope's `method` field (which means how the *record* was read, `record_model.gleam:122`).
  Rendered example: *"RPA 514 not attested in the Rev IV RPA set (glm-ocr-audited)."*
  Wording is explicitly provisional, honoring the absence discipline.
- **Corpus FY is the warrant key, threaded as a new parameter** (architectural change, stated
  here): the record's own FY field is unreliable — `Option`, absent in ~25% of FY88 records,
  and 2-or-4-digit. So warrant selection keys on the **corpus/file** FY, which must be passed
  into `construct.project` / the classifications constructor (today they take only a
  `SuppliedRecord`). Selection is a `case` on a `WarrantSet` sum type with guards (Gleam has no
  int-range patterns): `case fy { 88 | 89 -> RevIv; 94 -> Fy94Table; _ -> NoWarrant }`.
- **Absent / out-of-slice FY does not silently skip:** the `NoWarrant` arm means "no warrant
  set for this FY," and the RP-attestation check is **explicitly not run** — distinct from
  "run and clean." A skipped check emits no `RpaCodeNotAttested` and, if surfaced at all, is
  surfaced as "not checked (no warrant set for FY nn)", never as silent success.
- **Exhaustiveness edits (compiler-enforced, listed so they aren't a surprise):** the new
  `DisagreementKind` variant forces new arms in `report.describe_kind` (`report.gleam:235`)
  and `tally.kind_bucket` (`tally.gleam:160`).

## Evidence grade — one new honest variant

The new rule needs a rule-level `EvidenceGrade`, but the three existing variants
(`PrintedDictionary | HandwrittenAmendment | ValidationAddendum`, `record_model.gleam:89`) are
all tied to the `367_1DP` **record-layout** dictionary. The RPA rule is warranted by the
**Manual of Classification** and the annual tables — a different class of document (the
*meaning* codebook, not the byte-layout spec). None of the three can honestly label it.

**Add one new variant** naming the classification-vocabulary warrant (e.g.
`ClassificationSource` — covering both a manual edition and an annual table, since both are
published CRIS classification enumerations). This is a deliberate model change; the inventory
records that introducing a new evidence source is exactly an `EvidenceGrade` decision, so it is
made explicitly, not smuggled. The coarse rule-grade answers "what class of document backs this
rule"; the finer OCR-vs-born-digital strength stays in the dataset `method` (grades rot; facts
do not). The earlier claim that the grade axis was "untouched" was wrong and is withdrawn.

## Verification stage (required)

Honesty depends on complete extraction and a true searched-scope claim. The witnesses and what
each actually proves (corrected from a prior "two independent witnesses" overclaim):

- **Rev IV — two OCR engines over one scan.** IA-OCR and GLM read the same page images: their
  diff catches engine-specific error, not correlated error where the scan is worst. *Measured:
  100% code agreement, so this risk is empirically near-zero for the code set; the residual is
  the shared-scan blind spot, covered by the human page-image audit.*
- **Rev V — PDF and `.wpd` share one author.** Agreement verifies export/extraction fidelity
  (catches `pdftotext` glitches), not faithfulness to the manual.
- **Annual table vs manual — common upstream taxonomy, not independent truth.** Both descend
  from the official CRIS classification, so their agreement is *transcription-fidelity*
  evidence (different parse paths reproduce the same list), not independent confirmation that
  the taxonomy is correct. The table's warrant advantage is its **same-year date and clean
  born-digital text**, not independence. (This is the same skepticism applied to the OCR
  engines and PDF/WPD — the prior draft failed to apply it here.)

Stage steps:

1. **Multi-source extraction** — Rev IV (IA + GLM), Rev V (PDF + WPD), FY94 table.
2. **Automated diffs** — IA↔GLM (Rev IV), PDF↔WPD (Rev V, fidelity), cross-edition Rev
   IV↔Rev V, and Rev-V/Rev-IV↔FY94-table transcription checks. The annual table enumerates
   codes contiguously with `Goal Total` subtotals, so within-table completeness *can* be
   checked by contiguity + subtotal reconciliation — unlike the sparse manual, where
   contiguity gap-detection does not work and is not relied on.
3. **Label integrity pass** — flag OCR-corrupt tokens in Rev IV. A general dictionary
   false-flags agricultural terms, so this is a recall aid feeding the residue count, not a
   gate. *(Measured: 0 corrupted labels, so this is expected to be quiet.)*
4. **Bounded human adjudication** — review only the residue (diff disagreements, label flags,
   GOAL boundary codes) against the Rev IV page images.
5. **Searched-scope claim** — computed from the extraction pass, recorded in each header.
6. **Golden fixtures + provenance gate** — verified sets frozen as fixtures (count = 98, a
   sample of `code → label`); a build check fails if any row lacks `source_page`/`method`.

**Residue checkpoint.** The stage reports the count of codes needing human eyeballs. The
measurement sets the expectation: cross-source disagreement is **0** for the RPA code set, so
*any* disagreement in the real extraction is notable and worth stopping over — the checkpoint
is "> 0 disagreements → look before proceeding," not a number calibrated to the run it gates.

## Closed-set-over-absence — acknowledged limit

A "not attested" finding is a *closure* claim, stronger than the manual's *inclusion* warrant.
For the born-digital FY94 table the closure is well supported (clean text, contiguity + subtotal
checks). For the GLM-OCR Rev IV set the closure boundary is set by extraction completeness —
*measured at 100% code agreement across four sources*, which is strong evidence the boundary is
right, but bounded to the searched TOC scope. Every such finding is provisional and scoped
accordingly, with the method surfaced inline.

## Testing

- **Gleam (gleeunit), `should.*` + `_test`, existing `record(...)` fixture:** a known code
  passes; an unknown code yields `RpaCodeNotAttested` with the corpus-FY warrant set;
  `R`-prefix normalization (a real `R101` passes; a non-canonicalizable value yields **no**
  attestation finding, not a false one); the `WarrantSet` guard selects correctly (FY89→RevIv,
  FY94→Fy94Table) and an out-of-slice FY → `NoWarrant` runs no attestation check.
- **Codegen:** regeneration + `git diff --exit-code` on the generated module in the existing
  pretest gate.
- **Dataset fixtures:** count = 98 and sample assertions per source.
- **TS side:** unchanged; the reader stays structural.

**On what the runtime check yields (marked provisional, not measured):** the code *set* is
stable (measured), but the *rate at which real records carry out-of-set RP codes is not
measured*. So the earlier "near-inert / modest yield" claim is withdrawn as an unmeasured
absence; whether the check fires often is an open empirical question, answerable by running the
finished check across the certified corpora. The build-gate cost is justified by the check being
the documented gate and by the dataset's standalone value, not by a prediction of low yield.

## Known weaknesses (residual, after fixes)

1. **FY88/FY89 lean on GLM-OCR Rev IV** — mitigated to near-zero by the measured 100%
   cross-source code agreement; residual is the shared-scan blind spot, covered by human audit.
2. **Fiscal year is a coarse proxy for coding vintage** — codes assigned at classification,
   possibly years before the snapshot FY. Warrant map is a heuristic; findings worded
   provisionally.
3. **Rev IV continuous force (1982–1993) not independently verified here** — no intermediate
   edition modeled. Recorded as an open item, not asserted as fact.
4. **One warrant set per record** — mixed-vintage records not represented. Accepted as rare.
5. **JSON↔manual drift is open** — a later RO-Crate correction requires re-running extraction;
   only JSON↔generated drift is closed by the pretest gate.
6. **Runtime yield unmeasured** — see Testing; open empirical question, not a claim.

## Out of scope / later slices

- The other six classification columns. Note the normalization contract does **not** generalize
  by simply "strip a letter": the worked example `R101|A4100|C0100|F1524|020%|P1.01|J1A`
  (`field-rule-inventory.md:769`) shows AC/CM/FS carry a letter + digits, PA is dotted
  (`P1.01`), JC is `J1A`, and **CT is a bare percent (`020%`) with no vocabulary at all**. Each
  column needs its own canonicalization; that is later work.
- Revisions VI and X; FY93 (pending certification) and FY95/FY96 tables.
- Mixed-vintage record handling.

## Revision note

Revised after two parallel adversarial review rounds and a forensic OCR measurement. Round-2 +
measurement changes from the prior draft: **measured** the OCR (100% code agreement, n=98) and
replaced the "OCR might drop codes" hedge; corrected the code count (98, not ~200); **dropped
FY93** (held out/uncertified, the anachronism year) — slice is now the certified FY88/FY89 → Rev
IV, FY94 → FY94 table; **added a new `EvidenceGrade` variant** for the classification-vocabulary
warrant (the `367_1DP` layout-dictionary grades cannot honestly label a Manual-warranted rule)
and withdrew the "grade axis untouched" claim; softened the RP normalization to best-effort with
**no new shape reject**; keyed warrant on **corpus FY threaded as a new parameter** with an
explicit `NoWarrant` (never a silent skip); reframed the annual table as a **transcription
cross-check with a same-year-dating advantage, not an independent witness to taxonomy truth**;
**built** (not asserted) the method-surfacing render path; wired staleness to the **existing
pretest gate** rather than nonexistent CI; noted the compiler-forced `report`/`tally` edits;
corrected the false column-prefix generalization; and withdrew the unmeasured "near-inert" claim.
