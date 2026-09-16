# RPA facade-wiring slice — design

**Date:** 2026-09-16
**Status:** approved decisions, pending spec review
**Predecessor:** `2026-09-15-rpa-vocabulary-validation-design.md` (the feature this
turns live) and its plan. Read that first for the warrant model, the dataset →
codegen → `vocab_rpa` → `rpa_attestation` → `RpaCodeNotAttested` chain, and the
"statement of absence" framing.

## Goal

Make the vintage-scoped RPA-code check **live** in the two production entry points
that today run it inert. `tally.gleam` and `report.gleam` are the only callers of
`construct.project`; both hand it a file path and no vintage, so
`project_with_vintage(record, None)` runs and attestation never fires. This slice
lets those two learn the corpus fiscal year from the file they are already reading
and pass it into `project_with_vintage`, and clears the two carry-forward items
that only bite once a real fiscal year flows.

## Background: two different "fiscal years"

The warrant model in the predecessor selects a classification-Manual edition by
**corpus snapshot vintage** — which edition was in force when *this file* was coded.
That is a per-file fact (memory `cris-snapshots-two-layers`).

A record also carries its own `FY` field (`construct.fiscal_year`), but it is the
wrong source for the warrant on two counts, both established from the code:

1. **It is optional and frequently absent.** `construct.gleam`'s `fy_rule` records
   that 25.6% of real FY88 records (8182/32016, full-corpus tally) carry no `FY`
   value. Warranting off the record field would silently skip a quarter of a FY88
   file whose vintage we know for certain.
2. **It is the research-project year, not the coding vintage.** The warrant asks
   which Manual coded the snapshot; the record's `FY` answers a different question.

So the corpus vintage — known from the file identity the operator is already
pointing at — is the only honest source. This slice takes it from the **file name**.

## Decisions

### 1. Corpus fiscal year is inferred from the file name

A new pure function derives the fiscal year from the path both entry points already
hold:

```
rpa_attestation.corpus_fy_from_path(path: String) -> Option(Int)
```

**Contract:** scan the path for the token `FY` immediately followed by exactly two
ASCII digits; return those two digits as an `Int` (`RG310.CRIS.FY88.txt` → `Some(88)`,
`RG164.CRIS.FY94.txt` → `Some(94)`). No such token → `None`. On multiple matches the
leftmost wins (the corpus names carry exactly one). A four-digit form (`FY1988`) does
**not** match the strict two-digit pattern and yields `None` — the corpus uses the
two-digit form, and a silent 4→2 truncation would be a worse failure than an honest
`None` surfaced by the banner (decision 2).

`None` maps to today's behavior: `project_with_vintage(record, None)`, attestation
off. This is the safety property for the existing tests — they pass a bare label
(`"T"`), which yields `None`, so their per-record outputs are unchanged except for
the banner line this slice adds.

**Provenance discipline.** A vintage claim inferred from a file name is weaker
provenance than an operator assertion — a renamed or mislabeled file would yield a
wrong or absent warrant. Per the project's statement-of-provenance rule, the
inference is never silent: the reporting banner (decision 2) states the fiscal year
*and that it came from the file name*, so a human reading the output can catch a
mislabeling. See Known weaknesses.

### 2. The attestation mode is observable at the reporting boundary

`NoWarrant` is a corpus-level fact, not a per-record defect, so it is surfaced once
per run at the reporting boundary — never as a per-record problem kind (which would
flip every record's result and bury the fact in noise). A shared factual line:

```
rpa_attestation.attestation_note(corpus_fy: Option(Int)) -> String
```

renders one of three states from the inferred fiscal year:

| State | `corpus_fy` | Note (exact wording) |
|---|---|---|
| off | `None` | `RPA attestation off: no fiscal year in the file name` |
| active | `Some(fy)`, warrant | `RPA attestation active: FY<fy> (from file name) — <set_label>` |
| not run | `Some(fy)`, `NoWarrant` | `RPA attestation not run: no warrant set for FY<fy> (from file name)` |

`<set_label>` is `rpa_attestation.set_label(warrant_for(fy))` (e.g. `Rev IV RPA set
(glm-ocr-audited)`). Wording lives in `rpa_attestation` (one factual line, shared by
both callers — DRY), and each entry point places the returned line in its own output
block. `project`'s result type and every caller of it are unchanged.

- **tally**: the note is one line in the rendered stats block. The existing
  `RP rpa-not-attested` problem bucket (already wired in `tally.kind_bucket`) now
  populates when attestation is active.
- **report**: the note is one line appended to the run summary. Per-record
  `RpaCodeNotAttested` problems now appear via the existing `describe_kind` arm.

### 3. Attestation is gated on the RP length the base validator accepts

The RP field rule is `between(4, 74)` (`construct.gleam:582`): the base validator
already emits `InvalidFieldValue` for any RP value shorter than 4 bytes. A bare
three-byte `"999"` therefore gets both that problem and, because
`canonical_code("999")` succeeds, a redundant `RpaCodeNotAttested`.

Fix: in `merge_rpa_attestations`, attest only RP values whose byte length is ≥ 4 —
the same floor the base rule enforces. Shorter values are already reported by the
base; attestation does not pile on. Real `R###` values are exactly 4 bytes and still
attest normally. `canonical_code` is left exactly as the approved predecessor spec
has it ("strip one leading R if present, accept iff 3 digits remain"); only the
caller's input set is narrowed. The gate is on the **raw byte length** of the RP
value (what the base rule measures), applied before `bit_array.to_string`.

## Components and files

- **`src/rpa_attestation.gleam`** (modify): add `corpus_fy_from_path/1` and
  `attestation_note/1`. Both pure; no new dependencies beyond `gleam/string`,
  `gleam/int`, `gleam/option`.
- **`src/construct.gleam`** (modify): `merge_rpa_attestations` filters RP values to
  byte length ≥ 4 before attesting. No signature change; `project_with_vintage`
  already exists and is unchanged.
- **`src/tally.gleam`** (modify): `run` computes `corpus_fy` from the path; `tally`
  gains a `corpus_fy` parameter and calls `project_with_vintage(supplied,
  corpus_fy)` in its fold; `render` includes the note.
- **`src/report.gleam`** (modify): `report` computes `corpus_fy` from its `file`
  argument, threads it through `evaluate` → `project_line` to
  `project_with_vintage`; the run summary includes the note. `report`'s public
  signature is unchanged (fiscal year derived internally from `file`), so
  `cris_formatb.gleam` and existing callers need no change.
- **Tests** (modify/add): unit tests for the two new pure functions; a double-report
  regression test; updated `tally_test`/`report_test` expectations for the banner and
  for live attestation under a fiscal-year-bearing path.

## Data flow

```
path (RG310.CRIS.FY88.txt)
  └─ rpa_attestation.corpus_fy_from_path ─→ Some(88)
        ├─ construct.project_with_vintage(record, Some(88))
        │     └─ merge_rpa_attestations: attest RP values (len ≥ 4) vs warrant_for(88)=RevIv
        │           └─ RpaMiss → RpaCodeNotAttested problem (existing chain)
        └─ rpa_attestation.attestation_note(Some(88)) ─→ banner line in output
```

## Error handling and edge cases

- **Non-UTF-8 RP bytes**: unchanged — `merge_rpa_attestations` already skips a value
  whose bytes are not valid text (`bit_array.to_string` `Error`). The length gate is
  applied to the raw bytes first, so a short non-text value is doubly excluded.
- **`R##` (3 bytes: R + 2 digits)**: length < 4 → gated out of attestation; base
  flags it. `canonical_code` would have returned `Error` anyway (2 digits), so no
  behavior change beyond removing the base/attestation overlap that never existed for
  this shape.
- **Path with no `FY` token** (test labels, ad-hoc files): `None` → attestation off →
  existing behavior. Banner states "off".
- **Fiscal year with no warrant** (`Some(90)`): attestation not run; banner states it
  by fiscal year. No records are attested; no `RpaCodeNotAttested` appears.

## Testing strategy

- **Pure functions** (`corpus_fy_from_path`, `attestation_note`): table-driven unit
  tests over the input space — the three real corpus names, a no-`FY` label, a
  four-digit `FY1988` (→ `None`), a leftmost-of-two case, and all three note states.
- **Double-report gate**: a record carrying a bare `"999"` RP value under
  `project_with_vintage(_, Some(88))` yields exactly one problem for that value
  (`InvalidFieldValue`), not two; an `R###` miss yields exactly one
  (`RpaCodeNotAttested`).
- **Live wiring**: `tally`/`report` over a fiscal-year-bearing synthetic buffer show
  the active banner and the populated bucket / per-record problem; over a `None`-path
  buffer show the off banner and no attestation problems.
- **Gate discipline** (memory `dialog-file60-test-baseline`): baseline and final
  check run **root `pnpm test` + `pnpm typecheck`**, not just package `gleam test`.
  No `node:child_process` in any test. `test/archival/*` fail only for the absent
  gitignored corpus — environmental, not a regression, if nothing in loader/search/
  data is touched (nothing here is).
- Turning the check live **will** change real-corpus tallies for FY88/89/94: a
  `RP rpa-not-attested` bucket populates. Those findings are either genuine coding
  anomalies or were the double-report (fixed by decision 3); vet them against the
  corpus separately (env-gated).

## Out of scope / follow-ups

- **Explicit `--fy` override.** The operator-supplied fiscal-year flag (the
  alternative not chosen for this slice) would make provenance an assertion rather
  than an inference and would let an operator validate a mislabeled or renamed file.
  A clean follow-up if filename inference proves too brittle.
- **Nice-to-haves carried from the predecessor** (still non-blocking): a negative test
  guarding "Rev V is not compiled"; a `gen-vocab` per-dataset-uniform-`method` guard.

## Known weaknesses

- **Correctness couples to the file-naming convention.** A renamed, relabeled, or
  concatenated file yields a wrong or absent warrant. Mitigation: the banner surfaces
  the inferred fiscal year and its file-name provenance every run, so the failure is
  visible, never silent. The `--fy` override above is the durable fix.
- **Two-digit fiscal years are not century-qualified.** `FY94` is 1994 by corpus
  context; the code treats the warrant map (`88|89|94`) as the authority and makes no
  century claim. No corpus file spans the ambiguous boundary.
