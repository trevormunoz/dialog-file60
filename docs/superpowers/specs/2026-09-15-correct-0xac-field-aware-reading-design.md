# Correct the facade's `0xAC` reading: field-aware value splitting

**Date:** 2026-09-15
**Status:** design, approved section-by-section in brainstorming, then **revised
after a parallel adversarial review (2 reviewers)**. The review confirmed the
core reader-equivalence but found: the fix is not "one call site" (it must rework
leader/metadata computation or it panics), the gate was largely self-referential,
and two tags (BP, SN) were mis-sourced. All folded in below. Ready for spec review
then implementation planning.
**Relationship:** first of the three **deferred corrections** named in
`docs/superpowers/specs/2026-09-15-unify-gleam-reader-behind-facade-design.md`
("Out of scope / deferred"). That migration deliberately froze the facade to
reproduce the old TS reader's bytes *including its bugs* (its Settled decision 3).
This spec adopts the first correction and **establishes the shared reference
posture** that corrections #2 (code-page rendering) and #3 (non-ASCII tags) reuse.

## Goal

Make the emulator's facade read each field with the reader its cardinality calls
for — one value for single-value fields, marker-split values for repeating fields
— instead of splitting *every* field on the `0xAC` marker. This removes a real
defect: a single-value field (e.g. a narrative) whose wrapped continuation line
begins with `0xAC` is currently split into ≥2 spurious values, and the `0xAC`
byte itself is dropped. The corrected reading yields one value with the `0xAC`
retained as data — a converted left-quote character (the FY94 generalization
finding; `registry/evidence.json` `nara.conversion`).

This deliberately breaks byte-parity with the frozen TS oracle on exactly the
affected records, because the oracle is wrong there. The correction is applied
**only** to tags the 1982 manual documents as non-repeating — a sourced rule,
never inferred from the data (with one honestly-flagged caveat; see "Sourcing").

## The change — two coupled edits in `facade.gleam`

The PAR review corrected an earlier "one seam" framing. Two things in
`source_field_of` (`facade.gleam:221-254`) are coupled and both must change:

1. **Reader choice.** `facade.gleam:233` calls `field_value.field_values` for
   every field. It becomes cardinality-aware: `joined_value` for single-value
   tags, `field_values` for the rest. `joined_value` returns a single `BitArray`
   (not a list), so the single-value branch wraps it as a one-element value list.

2. **Leader/metadata computation.** `source_field_of` pairs the value list with
   `leader_fragments`/`fold_leaders` (`facade.gleam:235, 296-315`), which *also*
   opens a new entry on every `MarkedValueStart`, then asserts the two lengths
   agree (`facade.gleam:241-242`). If only (1) changed, a `0xAC`-bearing
   single-value field would yield 1 value but ≥2 leaders and the `let assert`
   would **panic** — on the exact records the fix targets. So the single-value
   branch must produce exactly one leader, and the merged value's metadata is
   **defined** as:
   - `line` / `offset` = the field's **first fragment** (the `TaggedStart`
     opener) location.
   - `continuation` = **`False`** (the sole value is opened by the field's
     `TaggedStart`, never by a `MarkedValueStart`).

   This is not a new rule: it is exactly what the current reader already produces
   for a single-value field that happens to have **no** `0xAC` (one value, leader
   = the `TaggedStart`, `continuation: false`). The correction makes the
   `0xAC`-bearing case behave like the ordinary case, which is the point.

**Reader equivalence, verified (both reviewers).** For a single-value field with
**no** `0xAC`, `joined_value` and `field_values` produce byte-identical value
bytes: both concatenate every fragment's `raw_columns` and `trim_trailing_spaces`
once (`field_value.gleam:24-33` vs `59-64`); the only divergence — the marker-byte
drop in `chunk_for` — never fires without a `MarkedValueStart`. So **only
`0xAC`-bearing single-value fields change**, in value count, in the recovered
`0xAC` byte, and in the surviving value's `continuation`/`line`/`offset`.

The type surface is unchanged (`SourceField.values` is already `List(SourceValue)`)
— no `.d.mts`/TS-interface change.

## The classification — a reader-layer table, three buckets

**Home (settled):** a new focused leaf module
`packages/cris-formatb/src/field_cardinality.gleam` in the reader layer (matching
`segment.gleam`/`latin1.gleam`). The facade consumes it; the validator's own
per-field dispatch is left untouched. It must **not** import `construct` (validator
symbols in the reader bundle fail `bundle-boundary.test.ts`).

```gleam
pub type Cardinality {
  SingleValue
  MultiValue
}

/// SingleValue only for tags the manual documents as non-repeating; everything
/// else (sourced repeating, undocumented, and unknown tags) is MultiValue = the
/// old reading. See the three buckets below.
pub fn cardinality(tag: String) -> Cardinality
```

Three buckets. The enumerated table is built in the plan's Task 1 and each
bucket-(a) tag is verified non-repeating **against the 1982 Manual of
Classification directly**, not only against `construct.gleam`'s dispatch — because
gate 4 proves the table matches `construct`, so a cardinality error `construct`
already carries would survive both (see Human gate H1). The spec fixes the
*structure*, not a hand-copied list:

- **(a) Single-value, manual-sourced → `SingleValue` → `joined_value`.** The
  **only** tags whose reading changes. These are the tags whose validator
  constructor reaches `single_value` **and** whose `RuleRef` documents them
  non-repeating: the narratives (OB, AP, PR, PB, DE), TI/PN/PS/**PT**, **AN**, the
  address and date scalars (AS…TX, FY, GY, UP…PX), and the exact-N code fields
  BT/AT/DT. **BP is excluded** — see (c).
- **(b) Multi-value, manual-sourced → `MultiValue` → `field_values`.** Unchanged
  output. The repeating fields: PF, IN, SF, SC, PH, GH, and all seven
  classification columns (AC/CM/FS/RP/CT/PA/JC).
- **(c) Unsourced → `MultiValue` → `field_values`** (the old reading; correct
  nothing we can't source):
  - **HP** — modeled but "not yet modeled", no reader, no cardinality rule.
  - **SN** — undocumented (`construct.gleam:695-697`: "not to infer an SN rule
    from its data behaviour"); kept as an unchecked `UndocumentedField`. Reads
    multi today; stays so.
  - **BP** — its `RuleRef` (`bp_rule`, `construct.gleam:463-470`) states BP has
    **no dictionary row**; its shape rests on "the PX precedent plus the FY94
    census," so its cardinality is **not** manual-sourced. The validator happens
    to read it via `single_value`, but BP is exact-12 and **never wraps**, so
    `joined_value` and `field_values` are identical for it — defaulting it to the
    old reading changes nothing and keeps the sourcing story honest.
  - **Any stray two-letter tag** not in `modeled_tags`.

The count is **36 single-value / 14 reads-multi** of the 51 `modeled_tags`
(14 = the 13 sourced repeating + SN); of the 36 that read single in the validator,
**35 are corrected** and **BP is held back** to bucket (c).

The safe direction is the default: a genuinely single-value tag we fail to list is
**under-corrected** (still splits, as today), never **mis-corrected**.

## Sourcing — and one flagged statement of absence

The cardinality of bucket (a) is manual-sourced: each tag's `RuleRef` documents it
non-repeating (e.g. OB is "printed 41 … Repeating N"). That is the rule we act on.

**Flagged, per the project's statements-of-absence rule:** the *interpretation*
that a line-start `0xAC` in these fields is a data byte (not a separator) rests
additionally on a scan finding **zero `0xAC`-marked values across ~3,000,000 FY88
lines** (`construct.gleam:883-891`) — FY88 only, FY94 held out. That is a
**statement of absence**, provisional to its method and span, not a closed proof.
Before landing we **extend the scan to all three held corpus files
(FY88 + FY89 + FY94)** so the absence covers the whole served corpus, not one file
(Human gate H2). It remains provisional beyond those three; a future file with a
genuinely `0xAC`-separated single-value field would be mis-merged. Recorded here so
no decision rests on the absence silently.

## The gate — parity-except-sourced-corrections

The frozen oracle **has no cardinality opinion** (it splits every field on `0xAC`
uniformly), so it cannot referee the single-vs-multi decision directly. The gate
is built around that limit, over the full corpus (not a sample):

1. **Parity preserved (regression guard).** Frozen TS oracle `==` facade —
   whole value, bytes *and* metadata — for every field of a **MultiValue/unsourced**
   tag. Proves the correction changed nothing outside bucket (a).
2. **Shaped differential on single-value tags (the real check).** Compare facade
   vs frozen oracle **field by field** for bucket-(a) tags. Every difference must
   fit the expected shape, asserted programmatically:
   - the field carried a line-start `0xAC` marker (a divergence on a
     *non*-`0xAC` single-value field fails — that would be an unintended change to
     the common case);
   - value count dropped (oracle ≥2 → facade 1);
   - the surviving value's `continuation` is `false` and its `line`/`offset` equal
     the field's first fragment (catches leader/metadata bugs — the B finding);
   - the `0xAC` byte is present in the merged bytes (recovered, not dropped).

   Any difference not fitting this shape fails. This is checked against the
   oracle's *actual* output, so it is not self-referential; it catches byte,
   count, metadata, and stray-change defects.
3. **Byte + metadata fixtures (always run).** A hand-built single-value field
   whose wrapped continuation starts with `0xAC`: assert the corrected single
   value's bytes contain the `0xAC`, `continuation == false`, and `line`/`offset`
   = the opener; and that the oracle would have split it. Sourced to the FY94
   finding + `evidence.json`. (Corpus checks 1–2 are opt-in,
   `CRIS_PARITY_CORPUS=1`, like the existing harness.)
4. **Classification completeness (omissions).** A **test-only** check (tests are
   not bundled) asserts `field_cardinality` classifies exactly `modeled_tags`,
   with bucket (a) = the 35 corrected tags and buckets (b)+(c-known: SN, BP, HP)
   = MultiValue. **Prerequisite:** `modeled_tags` (`construct.gleam:1216`) is
   currently private and must be made `pub const` — a one-line export the plan
   includes; it does not enter the reader bundle (only the test imports it).

**The residual weakness, stated plainly.** Gate 2's shaped differential cannot
distinguish a *correct* `0xAC`-artifact merge from an *erroneous* merge of
genuinely-distinct values on a tag we mis-sourced as single — both look like
"count dropped on a `0xAC` field." That residual is covered only by (i) the manual
sourcing of bucket (a), each tag annotated in Task 1 with the `RuleRef` and the
`construct.gleam` dispatch site it is read from, and (ii) a **required human diff
review**: read a sample of real merged values and confirm they read as prose with
a recovered quote, not as distinct values fused together. This is a
statement-of-absence-bounded guarantee, flagged as such.

## Human verification gates — the failure modes no automated gate can catch

The frozen oracle has no cardinality opinion and `field_values` ≡ `joined_value`
off the `0xAC` path, so a mis-sourced correction can be invisible to every
automated gate. These four human steps are **required** before landing, and are
tasks in the plan, not optional review:

- **H1 — Re-source the 35 corrected tags from the 1982 Manual.** Verify each is
  documented non-repeating in the Manual itself, not merely in `construct.gleam`.
  Gate 4 proves table == `construct`; only H1 catches an error the two share.
- **H2 — Extend the `0xAC`-absence scan to FY88 + FY89 + FY94** before landing, so
  the statement of absence covers the whole served corpus, not FY88 alone.
- **H3 — Stratified merge review.** Read at least one real merged record for
  **every** corrected tag that actually appears with `0xAC` in the corpus, and
  confirm it reads as prose with a recovered quote — not two genuinely-distinct
  values fused. This is the only check that distinguishes a correct merge from an
  erroneous one on a mis-sourced tag.
- **H4 — Before/after rendered-output comparison.** Beyond app-suite-green, a human
  compares old-vs-new rendered output on sample changed records and confirms the
  merged form is the more faithful reading. Acceptance is tied to fidelity, not
  just absence of breakage.

## Reference posture — the frozen oracle's lifecycle (program-wide)

Introduced here, reused by #2 and #3:

- The TS oracle (`record.ts`/`offsets.ts`) is kept **frozen** — the immutable
  pre-correction baseline. Corrections are **never** ported into it; its only job
  is to make each correction's blast radius computable (gates 1–2) and to define
  "old behaviour."
- Golden snapshots are **not** used (self-referential ceremony rejected).
- After correction #3, the frozen oracle disagrees with the facade on exactly the
  union of the three audited corrections and nothing else; it can then be retired,
  or kept as a permanent ledger of deliberate deviations from the 1990s reader.

## Out of scope / deferred

- **Corrections #2 (code-page rendering) and #3 (non-ASCII tags).** Separate
  specs; each reuses this spec's reference posture and gate shape.
- **Rewiring the validator** to consume `field_cardinality`. The validator already
  reads field-aware; unifying the two encodings is a later, optional tidy.
- **Re-deriving segmentation** or any other reader behaviour. Only the
  `field_values`-vs-`joined_value` choice (and its coupled leader/metadata
  computation) changes.

## Risks

- **The leader/metadata coupling (PAR, both reviewers).** The naive one-line fix
  panics on the target records. The change must collapse leader computation for
  single-value fields and define the merged value's metadata (above). Gate 3
  fixtures assert that metadata directly.
- **Mis-sourced cardinality is only partly catchable.** A tag wrongly marked
  SingleValue that never meets `0xAC` in the served corpus passes every gate
  (the frozen oracle has no cardinality opinion). Mitigated by manual sourcing +
  the required diff review + holding unsourced tags (BP/SN/HP) at the old reading;
  flagged as a statement-of-absence bound, not eliminated.
- **`modeled_tags` export.** Gate 4 needs `pub const modeled_tags`; without it the
  completeness test cannot compile. Included in the plan; verify it does not reach
  the bundle (`bundle-boundary.test.ts`).
- **Gate 1 mechanism.** The existing harness compares whole-record `JSON.stringify`
  and would fail wholesale once any single-value field diverges. Gates 1–2 require
  a **field-level** comparison (partitioned by cardinality), not whole-record —
  the harness must be re-scoped accordingly.
- **App-visible change.** The emulator renders from these values; a corrected
  field now renders as one value where it showed several. Intended, but confirm
  the app suite stays green and the visible change is the recovered artifact, not
  a regression, before landing.
