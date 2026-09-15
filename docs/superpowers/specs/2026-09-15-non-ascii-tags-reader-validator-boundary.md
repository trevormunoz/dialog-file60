# Correction #3 — non-ASCII tags: read in the reader, judge in the validator

**Date:** 2026-09-15
**Status:** design, approved in brainstorming. Compact spec (small, determinate
change; no sourcing or human gates). Ready for planning.
**Relationship:** third and last of the deferred corrections in
`2026-09-15-unify-gleam-reader-behind-facade-design.md`. Determinate: the frozen
TS oracle *is* the spec (no code page to source, unlike #2). Completes the
reader/validator boundary the migration was built on.

## Goal

The reader decodes a tag's two bytes with `bit_array.to_string` (UTF-8;
`assembly.role_of`, `assembly.gleam:76-78`), which **diverges from the oracle on
every non-ASCII tag**, two ways:
- **Invalid UTF-8** (e.g. `0xAC 0x41`): `to_string` returns `Error` →
  `Error(TagNotAscii)` → the facade's `let assert Ok(assemble …)`
  (`facade.gleam:189`) **panics**.
- **Valid non-ASCII UTF-8** (e.g. `0xC3 0xA9`): `to_string` returns a *single*
  char `"é"`, where the oracle yields a *two*-char latin1 tag `"Ã©"` — a silent
  mismatch, no panic.

The oracle never rejects and never collapses: it decodes with total `latin1`
(`record.ts:58`, `tag = latin1(bytes.subarray(at, at+2))`) — always two chars.
Make the reader do the same — **read every tag with latin1, never panic** — which
restores byte-parity in both cases, and move the judgment "this tag is not ASCII"
to the **validator** as a dedicated typed problem.

**Blast radius on the corpus: zero.** All ~100k FY88/FY89/FY94 tags are ASCII, so
`latin1` ≡ the current decode for every real record; the full-corpus parity
differential stays clean. This is a latent-panic removal + parity restoration +
boundary cleanup, not an output change.

## The change

### Reader (`assembly.gleam`)
- In `role_of` (~line 71-78), decode the two tag bytes with `latin1.decode`
  (total, always a 2-char string) instead of `bit_array.to_string`. The tagged-
  line branch becomes unconditional `Ok(Opens(tag, TaggedStart(witness)))`.
- Remove the `TagNotAscii(bytes)` variant from `AssemblyError`
  (`assembly.gleam:59`). `AssemblyError` keeps only `LineUnreadable(CardImageError)`
  (a line too short to read columns) — so `assemble` stays `Result`, and the
  facade's `let assert Ok` remains (guarding `LineUnreadable`, which is unreachable
  on a scanned record whose lines are 82-byte-aligned by construction — unchanged).
- `assembly` imports `latin1`.

### Downstream `AssemblyError` consumer (compiler-forced) — the real site
- The only exhaustive match on `AssemblyError`'s variants is `fn assembly_error`
  at `report.gleam:264-269`, whose arm `assembly.TagNotAscii(_) -> "a field tag
  was not ASCII"` (`report.gleam:267`) references the deleted constructor — remove
  that arm. The two `case assembly.assemble(…)` call sites (`report.gleam:65`,
  `tally.gleam:107`) match `Error(...)` **generically** and need no change.
- No test currently references `TagNotAscii`; the RED→GREEN test is new (below),
  not an edit to an existing assertion.

### Validator (`construct.gleam` + `record_model.gleam`) — dedicated diagnostic
- Add a `ConstructionProblem` variant (sibling of `FieldNotYetModeled` in
  `record_model.gleam`) naming a non-ASCII tag — e.g.
  `TagNotAscii(tag: String, at: Location)`. (Same name the reader is shedding: the
  concern *moves* from reader to validator.)
- In `construct.unmodeled_material` (`construct.gleam:1234`), before flagging a
  tag as `FieldNotYetModeled`, check whether the decoded tag string carries any
  codepoint ≥ 0x80; if so, emit the new `TagNotAscii` problem **instead** (it
  supersedes the generic unmodeled flag for that field). A non-ASCII tag can never
  be in `modeled_tags` (all 51 are ASCII), so this only refines an already-flagged
  field, never hides a modeled one.
- **Exhaustive `ConstructionProblem` matches the new variant forces (compiler-
  caught):** the two catch-all-free matches — `describe` (`report.gleam:227-233`)
  and `bucket` (`tally.gleam:152-158`) — each gain a `TagNotAscii` arm. (There is
  no `render` module.) `is_not_yet_modeled` (`tally.gleam:143-148`) has a
  `_ -> False` catch-all, so a `TagNotAscii` field falls through as "not
  unmodeled" and is excluded from the `unmodeled_only` count — behaviorally fine
  (it is a distinct, more-specific problem), zero corpus impact.

### Facade doc comment
- Update the `let assert Ok(assembly.assemble …)` comment block
  (`facade.gleam:179-190`), which currently documents this panic as a "KNOWN,
  DEFERRED divergence from the oracle." After the fix the divergence is gone (tags
  read latin1, no panic); the comment must say so rather than describe a deferral
  that no longer exists.

## Gate posture

Reuses the frozen-oracle parity harness (`test/parity.test.ts`) and the reader's
gleeunit suite. No new corpus gate (zero corpus impact). Tests:

1. **Reader (gleeunit, `assembly_test.gleam`):** a line whose two tag bytes are
   `0xAC 0x41` (`¬A`) assembles to an `Opens("¬A", …)` field, no error/panic.
2. **Facade parity (synthetic TS fixture in `parity.test.ts`):** a record with a
   non-ASCII tag (`0xAC 0x41` → `"¬A"`) parses without panic, and
   `assertFieldLevelParity(gParse, tsParse)` locks the **whole** odd-tagged field
   (tag, values, raw, offsets, continuation) to the oracle — not just the tag
   string. Today `gParse` throws on this input (real RED via a failing test, no
   `toThrow` scaffold needed); after the fix it matches the oracle (GREEN). Body
   parity already holds by construction — `field_cardinality` defaults an unknown
   tag to `MultiValue` (the oracle's split-on-`0xAC` path), and the comparator's
   non-single-value branch runs full `JSON.stringify` equality — but the gate
   asserts it rather than assuming it.
3. **Validator (gleeunit `construct_test.gleam`):** the same record yields the new
   `TagNotAscii` `ConstructionProblem`, not `FieldNotYetModeled`.

Gates: `gleam test` / `gleam check` / `gleam format --check src test`,
`pnpm run build`, `pnpm run typecheck`, `pnpm test`.

## Scope / risks

- **Reader/validator boundary ripple.** This intentionally touches both
  `assembly` (reader) and `construct`/`record_model`/`report`/`tally` (validator
  side) plus their tests. That is the point (moving the concern), but it means the
  validator's 162-test suite must stay green — and the exhaustive matches named
  above (`report.gleam:267` for `AssemblyError`; `describe` and `bucket` for
  `ConstructionProblem`) must each be updated. All are compiler-caught in Gleam,
  so nothing ships broken; the risk is only forgetting one and failing `gleam
  check`.
- **`bundle-boundary.test.ts`** must stay green: the reader change adds only a
  `latin1` import to `assembly` (already in the bundle), no validator symbols.
- **No behavior change on the corpus** — confirm the full-corpus parity
  differential still reports the same 4 single-value `0xAC` divergences from #1 and
  nothing new.

## Out of scope

- Correction #2 (code-page rendering) — deferred as a correction (see
  `2026-09-15-code-page-rendering-sourcing-spike.md`).
- Any change to what tags are *modeled*; this only changes how a non-ASCII tag is
  *read* (latin1, no panic) and *reported* (dedicated diagnostic).
