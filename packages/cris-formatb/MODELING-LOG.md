# Format B modeling log

The dated record of how this whole-record reading was built and tested: the
rule-inventory batches, the checked constructor's results against the FY88 / FY89
/ FY94 corpora, the held-out generalization tests and their reconciliations, the
classification-alignment census, and the maintainability review. This is
*history* — the reasoning trail behind the current design — kept out of the
[README](./README.md) so that file can state what the validator does now.
Counts and dates are as they were when written; sections are in the order they
were written.

For the current design and what `construct.project` checks, see the
[README](./README.md). For per-feature design specs (including the RPA
vocabulary attestation), see `docs/superpowers/specs/`.

## Maintainability review and the language comparison

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

## Documentary rule inventory (in progress)

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

## FY88: the checked constructor over the whole corpus

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

## FY94 generalization test (held-out corpus)

`construct.project` was run end-to-end over the **whole held-out FY94 corpus**
(`data/RG164.CRIS.FY94.txt`, 3,384,622 lines, 34,090 records, `0xAC` marker) via
the same `tally` module. This corpus was held out through every FY88
reconciliation above, so it is a genuine test of a different fiscal-year vintage
(FY94 vs FY88).

The `RGnnn` file-name prefix is a **NARA record group**, and it identifies the
accession each file came into NARA through — verified from the repo's own
`dataset-cards/research/cris-dialog/README.md` and the NARA record-group authority:
- **FY88** (`RG310.CRIS.FY88.txt`) came via accession **NN3-310-90-001** (Oct 1990),
  **Record Group 310 — Records of the Agricultural Research Service (ARS)**.
- **FY89–FY94** (`RG164.CRIS.*`) came via accession **NN3-164-93-001** (1993),
  **Record Group 164 — Records of the Cooperative State Research Service (CSRS)**,
  the agency that ran CRIS.

The 2018 manifest `CRIS_TSS367.pdf` catalogs the whole consolidated series
(6207709) under RG 164, but FY88's `RG310` prefix is a fossil of its original,
separate ARS accession. So FY88 differs from the rest along **two** confounded
axes at once: an earlier, ARS-routed 1990 accession *and* the earliest fiscal year.
Among FY89–FY94 (all RG 164 / CSRS, one 1993 accession) differences are pure
vintage; FY88's cannot be cleanly split between "older CRIS export" and "ARS-side
transfer". (An earlier draft of this file mis-corrected the prefix as a non-archival
USDA label; that was wrong — it is a record group.) This is BARC-relevant: BARC/
Beltsville is an ARS facility, so the ARS-accessioned FY88 file sits closer to
Beltsville's own institutional provenance than the CSRS-accessioned later years.

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

### Reconciliation, and what remains

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

3. **SN modeled as a source-undocumented field.** SN (27,607 records, 81% of
   FY94) is the *other* validation-addendum tag — "a percentage that refers to
   the previous SC field tag" — and the inventory's standing instruction is *not*
   to infer an SN rule from its data behaviour. It was previously reported as
   `FieldNotYetModeled`, which conflated two different things: fields *we* have
   not modeled yet (a backlog — e.g. HP) and a field *the source itself* declared
   it never documented. These are now distinct. A new type `UndocumentedField`
   (evidence grade `ValidationAddendum`) records SN as a **preserved, unvalidated
   presence** — its bytes are kept, never decoded or checked, carried on the
   `Project` and surfaced via `project_undocumented_fields` — and it is **not** a
   `ConstructionProblem`. So a record carrying SN certifies, while the presence is
   never hidden. HP and genuinely unmodeled tags stay `FieldNotYetModeled` (still
   fatal), so the two concepts have a clean test. Result: FY94 certification rose
   to **99.99% (34,086/34,090)** — of which 6,483 are fully clean and **27,603
   certify while carrying SN** (reported as a distinct tier by `tally`, so 100%
   never conflates the two). FY88 is unchanged: 32,016 clean, **0** carrying SN
   (SN does not occur there — which is what makes the tier real, not cosmetic).

4. **The `0xAC` marker/data collision in single-value fields.** Investigating the
   handful of residual failures found three `PR`/`PB` records reported (misleadingly)
   as `FieldNotYetModeled`. The cause: `0xAC` is both the continuation marker *and*
   a data byte in prose — a left single-quote conversion artifact (`'Golden
   Delicious'`, `'Empire'`). When a long single-value narrative wraps such that a
   data-`0xAC` lands at a continuation-line start, the reader misread it as a
   `MarkedValueStart`, split one narrative into two values (dropping the quote
   byte), and `single_value` then failed and mislabeled it. Fix (field-aware
   reading): single-value fields (OB/AP/DE/PR/PB and the scalar fields) read via a
   new `field_value.joined_value` that concatenates *all* fragments and keeps a
   line-start `0xAC` as data — the marker never separates values in a field that
   has only one. Multi-value fields (SC/PH/GH/PF) still honor the marker via
   `field_values`; `assembly` is unchanged. This also retired the `FieldNotYetModeled`
   mislabel for these records. Result: FY94 certification rose to **99.997%
   (34,089/34,090)**; FY88 unchanged (no FY88 single-value field ever hit the
   collision, so it stays byte-identical at 100%).

After all four changes, the **only** record that still fails in the entire
34,090-record held-out corpus is a single `DE non-repeating-repeated` — a record
with two `DE` tagged lines, which genuinely diverges from DE's printed `Repeating
N` rule. That is correct behavior (the constructor flags a real conflict), not a
modeling gap.

The honest summary of the generalization test: the Format B **frame** generalizes
perfectly across every fiscal-year vintage tested (and across the FY88 ARS accession
vs the FY89–94 CSRS accession — see the RG310/RG164 note); one
overfit **field rule** (SC percent) was found and corrected; one **coverage gap**
(BP) was filled; one field the source itself declared undocumented (SN) was given
an honest representation rather than counted as the model's failure; and one format
ambiguity (the `0xAC` marker/data collision) was resolved by field-aware reading.
FY94 certifies at 99.997%, reported as clean vs SN-carrying so the figure never
overclaims, with one genuine `DE` divergence remaining. All counts scoped to these
corpora and the `0xAC` marker.

## FY89: a third corpus, held out, certifies clean with zero new work

The SC/BP/SN/collision changes above were all derived from FY88 and FY94. To test
whether they capture Format B or just those two files, a **third corpus was held
out entirely and then run once**: `data/RG164.CRIS.FY89.txt` (3,275,083 lines,
33,499 records), extracted from the same 2026-09-07 NARA web capture (its payload
SHA-256 verified against the capture's recorded digest before use). It played no
part in any rule, reconciliation, or fix.

**FY89 certifies 100% (33,499/33,499): 0 failed, 0 unreadable** — no new
divergences, no new fields, not even the lone `DE`-repeat FY94 had. A third
independent corpus certifying clean under rules built without it is the evidence
the earlier 100%s could not give on their own: this is capture, not fit. (25,814
of the 33,499 carry SN, reported in the source-undocumented tier as always.)

FY89 also **locates the schema shift** — with a caveat about what it can and
cannot separate. FY89 already carries BP and SN — like FY94, unlike FY88, which had
neither — so the CRIS schema additions appear at the **FY88→FY89 boundary**. But
that boundary is confounded: it is also where the accession/record-group changes
(FY88 via the 1990 ARS accession, RG 310; FY89 on via the 1993 CSRS accession,
RG 164). So FY88's differences cannot be cleanly attributed to fiscal-year vintage
alone versus its separate ARS-routed transfer. What FY89 *does* establish cleanly:
**among the RG 164 / CSRS files (FY89–FY94, one 1993 accession), the schema is
already stable by FY89** — BP and SN present, and a corpus held out from all rules
certifying 100%. FY88 stands apart on both axes at once. This is the two-layer
reading (a stable Format B envelope around a drifting CRIS schema) shown across
three years rather than argued from two. FY90, FY91, and FY93 remain held out and
unmeasured; none can isolate FY88's vintage from its provenance, since FY88 is the
only ARS-accessioned file.

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

Validation after this work: `gleam test` **156 passed**, `gleam check` zero
errors (one expected `LoadedRecord` unused-constructor warning — `build_project`
resolved the other, for `Project`), and `gleam format --check src test` clean.
`simplifile` moved to `[dependencies]` and `argv` was added, for the entrypoint
and the `tally` corpus-analysis module; the reference TS parser is unchanged.

## Classification alignment: offered as a derived view, not enforced as a rule

The open question from §5 above — do the seven classification columns (AC, CM,
FS, RP, CT, PA, JC) constitute one linked allocation per position, or seven
independent lists? — is now **resolved, and resolved in favour of restraint.**

A full-corpus census settled the shape of the data. Each column is a 0xAC
multi-value field (like SC), and per record the seven columns have **equal value
counts in 100% of records across all three corpora** — FY88 32,016/32,016, FY89
33,499/33,499, FY94 34,090/34,090, zero exceptions. CT is the per-line percent
(its values carry `%`), and the CT values **sum to 100% in every FY89 and FY94
record**, and in all but **25 FY88 records** — those 25 are genuine
under-allocations (e.g. a lone `033%`, or three lines summing to 95%), so "CT
sums to 100" is a strong tendency, not a rule. Worked example (FY94 record
9049442, four aligned lines): `R304|A4900|C1000|F0513|042%|P3.13|J2A` … through
`R307|A4900|C2600|F0312|015%|P3.11|J2A`, CT summing to 100.

That is the strongest possible **evidence** for positional alignment. It is not
**proof**, and the distinction is the whole point. Unlike the SN↔SC bond — which
is enforced because an agency note *documents* the pairing — the classification
columns have **no documentary statement of alignment**: the Data Element
Dictionary describes only "columnar display" (a display behaviour, §5), and the
1982 Manual of Classification, which could document per-line percentage
allocation, is not in hand. Enforcing a count-bond from the census alone would be
**inferring a rule from data** — the exact move the SN treatment forbids. It would
also force the model's first *non-documentary* `EvidenceGrade` and strain
`RuleRef` (whose `document`/`pdf_page` fields would have nothing to point at),
widening the model's provenance claim from documentary-only to
documentary-or-observed. Judged too costly for a claim no source backs.

So the alignment is **offered, never claimed.** `record_model.classification_rows`
is a pure projection: it zips the seven columns into `ClassificationRow` values
when their lengths match, and returns `Error(Nil)` when they do not — degrading
loudly rather than silently truncating. The stored `ClassificationColumns` (seven
source-faithful lists) is unchanged, and `EvidenceGrade`, `RuleRef`, and the
certification tiers are untouched. The observed regularity is pinned executably by
a regression test over committed real bytes (the FY94 9049442 fixture — four rows,
CT summing to 100) plus three projection unit tests; `gleam test` **162 passed**,
`gleam check` and `gleam format --check` clean. The warrant to revisit is
explicit: a 1982-Manual passage documenting per-line percentage allocation would
supply the missing proof and justify promoting the view to an enforced row model.
