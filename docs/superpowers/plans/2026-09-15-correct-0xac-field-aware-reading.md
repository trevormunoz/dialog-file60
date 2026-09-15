# Correct the facade's `0xAC` reading (field-aware value splitting) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the emulator's facade read single-value fields as one joined value (a line-start `0xAC` kept as data) and repeating fields split on the `0xAC` marker, correcting the current uniform-split defect — behind the unchanged `@barcstory/cris-formatb` surface.

**Architecture:** A new reader-layer `field_cardinality` table drives one `facade.gleam` seam (reader choice + leader/metadata collapse). The frozen TS oracle (`record.ts`/`offsets.ts`) stays as the pre-correction baseline; the parity harness moves from whole-record equality to a field-level check: strict parity on multi/unsourced tags, a shaped differential on single-value tags. Four human gates (H1–H4) cover the failure modes no automated gate can reach.

**Tech Stack:** Gleam 1.18 (JavaScript target), gleeunit; TypeScript + vitest for the parity harness; esbuild/rollup bundle. Throwaway Python/shell for the corpus scan.

**Design spec:** `docs/superpowers/specs/2026-09-15-correct-0xac-field-aware-reading-design.md` (read it first).

## Global Constraints

- **Frozen public surface.** No change to `@barcstory/cris-formatb`'s types or the generated `.d.mts`. `SourceField.values` stays `List(SourceValue)`; the correction changes value *count/bytes/metadata*, never the shape.
- **Bundle purity.** `src/field_cardinality.gleam` MUST NOT import `construct` (validator symbols in `dist/engine.mjs` fail `test/bundle-boundary.test.ts`). Any cross-check against `construct` lives in a *test* only.
- **Gates (run from `packages/cris-formatb`).** `gleam test`, `gleam check`, `gleam format --check src test` must pass; the package build (`pnpm run build`) must succeed; `pnpm run typecheck` (tsc `--noEmit`, catches type errors vitest does not) and `pnpm test` (vitest) green. Never commit broken code.
- **Full-corpus parity is opt-in:** `CRIS_PARITY_CORPUS=1 pnpm exec vitest run test/parity.test.ts` (needs `data/` present). Committed fixtures always run.
- **Forensics are throwaway.** The corpus scan (Task 4) is stdlib Python/shell kept in the scratchpad, never committed (Gleam = checked rules, Python = throwaway forensics).
- **The 35 corrected single-value tags** (Manual-documented non-repeating): AN PN TI PS PT AS DS IC PI CY ST ZP RE CG RG RN OC PD SD SX TD TX FY GY UP PP PX BT AT DT OB AP DE PR PB. Everything else in `modeled_tags` (the 13 repeating tags, plus the undocumented SN, BP, and HP) and every unknown tag → MultiValue = old reading. **This list appears in three places** — `field_cardinality.gleam` (source of truth), `SINGLE_VALUE_TAGS` in `parity.test.ts`, and the Task 4 scan — each MUST carry a comment pointing at `field_cardinality.gleam`; drift where a tag is single in Gleam but missing from the TS set fails gate 1, and Task 4↔harness drift is caught by Task 4 Step 3.
- **Commit attribution** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CpKNmyiyvL43QvYMQFy3Nk
  ```
- **H1–H4 are required before landing**, not optional review (see Task 1 step H1, Task 4, Task 5).

---

### Task 1: `field_cardinality` reader table + completeness cross-check

**Files:**
- Create: `packages/cris-formatb/src/field_cardinality.gleam`
- Create: `packages/cris-formatb/test/field_cardinality_test.gleam`
- Modify: `packages/cris-formatb/src/construct.gleam:1216` (make `modeled_tags` public)

**Interfaces:**
- Produces: `field_cardinality.Cardinality` (`SingleValue` | `MultiValue`) and `field_cardinality.cardinality(tag: String) -> Cardinality`. Consumed by Task 2.
- Produces: `pub const construct.modeled_tags: List(String)` — consumed by this task's test only.

- [ ] **Step 1: Write the failing completeness test.**

`test/field_cardinality_test.gleam`:
```gleam
import construct
import field_cardinality.{MultiValue, SingleValue}
import gleam/list
import gleeunit/should

// The 35 Manual-documented non-repeating tags (design spec bucket (a)).
const single_value_tags = [
  "AN", "PN", "TI", "PS", "PT", "AS", "DS", "IC", "PI", "CY", "ST", "ZP", "RE",
  "CG", "RG", "RN", "OC", "PD", "SD", "SX", "TD", "TX", "FY", "GY", "UP", "PP",
  "PX", "BT", "AT", "DT", "OB", "AP", "DE", "PR", "PB",
]

// COVERAGE guard: the table must classify exactly the modeled-tag universe, and
// no single-value tag may sit outside it. (The SIDE of each tag is guarded by
// H1 — Manual re-sourcing — not by this test.) Importing construct is test-only
// and never enters dist/engine.mjs.
pub fn classification_matches_modeled_tags_test() {
  list.each(single_value_tags, fn(tag) {
    list.contains(construct.modeled_tags, tag) |> should.be_true
  })
  list.each(construct.modeled_tags, fn(tag) {
    let want = case list.contains(single_value_tags, tag) {
      True -> SingleValue
      False -> MultiValue
    }
    field_cardinality.cardinality(tag) |> should.equal(want)
  })
}

// BP and SN are modeled but unsourced -> MultiValue (old reading), NOT single.
pub fn unsourced_tags_are_multivalue_test() {
  field_cardinality.cardinality("BP") |> should.equal(MultiValue)
  field_cardinality.cardinality("SN") |> should.equal(MultiValue)
  field_cardinality.cardinality("HP") |> should.equal(MultiValue)
  // an unknown tag defaults to the old reading too
  field_cardinality.cardinality("ZZ") |> should.equal(MultiValue)
}
```

- [ ] **Step 2: Run it; verify it fails to compile** (module + `construct.modeled_tags` don't exist yet).

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — `field_cardinality` not found / `modeled_tags` is private.

- [ ] **Step 3: Make `modeled_tags` public.**

`construct.gleam:1216`: change `const modeled_tags: List(String) = [` to `pub const modeled_tags: List(String) = [`. Nothing else.

- [ ] **Step 4: Write `field_cardinality.gleam`.**

```gleam
//// The reader-layer cardinality of a Format B field tag: whether the facade
//// reads it as one joined value (a line-start 0xAC is a data byte) or splits it
//// on the 0xAC marker. The SingleValue set is the tags the 1982 Manual of
//// Classification documents as non-repeating (mirrored from the validator's
//// single_value dispatch, and re-sourced against the Manual in H1). Unsourced
//// tags -- HP, SN, BP, and any tag the Manual does not document -- default to
//// MultiValue = the old reading, correcting nothing we cannot source. See
//// docs/superpowers/specs/2026-09-15-correct-0xac-field-aware-reading-design.md.
//// MUST NOT import `construct`: this module is in the reader bundle; the
//// completeness cross-check lives in field_cardinality_test.gleam instead.

pub type Cardinality {
  SingleValue
  MultiValue
}

/// SingleValue for the 35 Manual-documented non-repeating tags; MultiValue for
/// every sourced repeating field, the undocumented BP/SN, HP, and any unknown
/// tag.
pub fn cardinality(tag: String) -> Cardinality {
  case tag {
    "AN" | "PN" | "TI" | "PS" | "PT" | "AS" | "DS" | "IC" | "PI" | "CY" | "ST"
    | "ZP" | "RE" | "CG" | "RG" | "RN" | "OC" | "PD" | "SD" | "SX" | "TD" | "TX"
    | "FY" | "GY" | "UP" | "PP" | "PX" | "BT" | "AT" | "DT" | "OB" | "AP" | "DE"
    | "PR" | "PB" -> SingleValue
    _ -> MultiValue
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS (both `field_cardinality_test` functions green; no other test regresses — `modeled_tags` going public breaks nothing).

- [ ] **Step 6 (H1 — required human gate): Re-source the 35 tags from the 1982 Manual.**

For each of the 35 tags, confirm the Manual documents it non-repeating (its `RuleRef` in `construct.gleam` cites the element and "Repeating N" / exact-N; verify a sample against the Manual PDF directly, since gate 4 cannot catch an error `construct` and this table share). Record the result as a short sourcing note appended to the design spec or a sibling `…-h1-sourcing.md`. If any tag is NOT clearly non-repeating in the Manual, move it to MultiValue (bucket c) and update Step 1/Step 4 before proceeding.

- [ ] **Step 7: Format, check, commit.**

```bash
cd packages/cris-formatb && gleam format src test && gleam check && gleam test
git add packages/cris-formatb/src/field_cardinality.gleam \
        packages/cris-formatb/test/field_cardinality_test.gleam \
        packages/cris-formatb/src/construct.gleam
git commit -m "feat(cris-formatb): field_cardinality reader table (sourced non-repeating tags)"
```

---

### Task 2: Field-aware reading in the facade (reader choice + leader/metadata collapse)

**Files:**
- Modify: `packages/cris-formatb/src/facade.gleam` (`source_field_of`, ~221-254; add `import field_cardinality`)
- Test: `packages/cris-formatb/test/facade_test.gleam` (add fixtures; reuse its `served_line` helper)

**Interfaces:**
- Consumes: `field_cardinality.cardinality/1`, `field_value.joined_value/1` (returns `Result(BitArray, _)`), `field_value.field_values/1` (returns `Result(List(BitArray), _)`).
- Produces: unchanged `facade.parse_record` signature and `LogicalRecord`/`SourceField`/`SourceValue` shapes; only field values' count/bytes/metadata change for single-value tags.

- [ ] **Step 1: Write the failing fixture test** (gate 3 — byte + metadata of the recovered `0xAC`).

Add to `test/facade_test.gleam` (add `import gleam/string`):
```gleam
// A single-value field (OB) whose wrapped continuation begins with 0xAC. The old
// uniform reading split it into two values and dropped the 0xAC; the corrected
// field-aware reading yields ONE value with the 0xAC recovered as data, opened by
// the field's own tagged start (continuation: false). Design spec gate 3.
pub fn single_value_field_keeps_line_start_0xac_as_data_test() {
  let crlf = <<13, 10>>
  let bytes =
    bit_array.concat([
      served_line(<<"<< H":utf8>>, crlf),
      served_line(<<"$$":utf8>>, crlf),
      served_line(<<"AN 9000001":utf8>>, crlf),
      served_line(<<"OB ":utf8, "First part":utf8>>, crlf),
      // blank tag (cols 1-2), col-3 pad, then 0xAC as the first DATA byte ->
      // assembly marks this a MarkedValueStart continuation.
      served_line(<<"  ":utf8, 32, 0xAC, "quoted tail":utf8>>, crlf),
      served_line(<<">> T":utf8>>, crlf),
    ])
  let scanned = facade.scan_records(bytes, 1)
  let assert [span, ..] = scanned.spans
  let rec = facade.parse_record(bytes, span, "synthetic", facade.Fy1991plus, 1)
  let assert Ok(ob) = find_field(rec.fields, "OB")

  ob.values |> list.length |> should.equal(1)
  let assert [only] = ob.values
  only.continuation |> should.equal(False)
  only.line |> should.equal(4)
  // latin1 decodes 0xAC to U+00AC; the byte survives as data, not a boundary.
  string.contains(only.raw, "\u{00AC}") |> should.be_true
}
```

- [ ] **Step 2: Run it; verify it fails for the right reason.**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — `list.length` is 2, not 1 (current facade splits every field on `0xAC`). This is the exact defect.

- [ ] **Step 3: Implement the field-aware dispatch.**

In `facade.gleam` add `import field_cardinality` and replace the value/leader block of `source_field_of` (currently `facade.gleam:233-245`) with:
```gleam
  // Cardinality-aware reading (design spec 2026-09-15). A single-value field
  // joins to ONE value keeping a line-start 0xAC as data; its sole value's
  // leader is the field's opener (TaggedStart -> continuation: false). A
  // repeating field splits on the 0xAC marker exactly as before. The two folds
  // (values, leaders) must stay length-matched, so both are chosen together.
  let #(byte_values, leaders) = case field_cardinality.cardinality(tag) {
    field_cardinality.SingleValue -> {
      let assert Ok(value) = field_value.joined_value(occurrence)
        as "an assembled occurrence's own fragments always yield readable columns"
      #([value], [first])
    }
    field_cardinality.MultiValue -> {
      let assert Ok(byte_values) = field_value.field_values(occurrence)
        as "an assembled occurrence's own fragments always yield readable columns"
      #(byte_values, leader_fragments(fragments))
    }
  }
  let assert True = list.length(byte_values) == list.length(leaders)
    as "field_values and leader_fragments must produce one entry per value"
  let values =
    list.zip(byte_values, leaders)
    |> list.map(fn(pair) { source_value_of(pair.0, pair.1, percent_in_block) })
```
(`first`, `fragments`, `tag`, `percent_in_block` are already in scope from the top of `source_field_of`. The old two lines that computed `byte_values` via `field_value.field_values` and `leaders` via `leader_fragments` unconditionally are removed — they are what panics on the single-value `0xAC` case.)

- [ ] **Step 4: Run tests; verify green and no regression.**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS — the new fixture (1 value, `0xAC` recovered, `continuation: false`), AND the existing `parse_record_projects_the_fixture_record_test` (AC is multi-value; its four values and `second.continuation == True` unchanged — proves repeating fields are untouched).

- [ ] **Step 5: Format, check, build, commit.**

```bash
cd packages/cris-formatb && gleam format src test && gleam check && gleam test && pnpm run build
git add packages/cris-formatb/src/facade.gleam packages/cris-formatb/test/facade_test.gleam
git commit -m "feat(cris-formatb): facade reads fields by cardinality (0xAC single-value fix)"
```

---

### Task 3: Re-scope the parity harness to field-level (parity-except-sourced-corrections)

**Files:**
- Modify: `packages/cris-formatb/test/parity.test.ts` (replace whole-record parse comparison with a field-level check)

**Interfaces:**
- Consumes: `gParse`/`tsParse` (already imported), the frozen `LogicalRecord`/`SourceField` shapes (camelCase, identical between facade and oracle).

- [ ] **Step 1: Add the single-value tag set and a field-level comparator.**

In `test/parity.test.ts`, add (mirrors `field_cardinality.gleam`; test-only copy):
```ts
const SINGLE_VALUE_TAGS = new Set([
  "AN","PN","TI","PS","PT","AS","DS","IC","PI","CY","ST","ZP","RE","CG","RG",
  "RN","OC","PD","SD","SX","TD","TX","FY","GY","UP","PP","PX","BT","AT","DT",
  "OB","AP","DE","PR","PB",
]);

// Field-level parity-except-sourced-corrections (design spec gates 1-2). Multi/
// unsourced tags must match the frozen oracle exactly. A single-value tag either
// matches exactly (no 0xAC) or diverges in EXACTLY the corrected shape: oracle
// split >=2, facade joined to 1, continuation false, opener line/offset kept,
// 0xAC recovered as data. Any other difference fails.
function assertFieldLevelParity(g: any, ts: any): void {
  // Every record-level field the whole-record JSON.stringify used to cover, so
  // this comparator is not weaker than what it replaces (record.ts:7-12).
  expect(g.file).toBe(ts.file);
  expect(g.an).toBe(ts.an);
  expect(g.firstLine).toBe(ts.firstLine);
  expect(g.lastLine).toBe(ts.lastLine);
  expect(g.offset).toBe(ts.offset);
  expect(g.length).toBe(ts.length);
  expect(g.orphanContinuations).toBe(ts.orphanContinuations);
  expect(g.fields.length).toBe(ts.fields.length);
  for (let i = 0; i < ts.fields.length; i++) {
    const gf = g.fields[i], tf = ts.fields[i];
    expect(gf.tag).toBe(tf.tag);
    if (!SINGLE_VALUE_TAGS.has(tf.tag)) {
      expect(JSON.stringify(gf)).toBe(JSON.stringify(tf)); // gate 1
      continue;
    }
    if (JSON.stringify(gf) === JSON.stringify(tf)) continue; // single-value, no 0xAC
    // gate 2 — shaped differential
    expect(tf.values.length).toBeGreaterThanOrEqual(2);
    expect(gf.values.length).toBe(1);
    expect(gf.lineStart).toBe(tf.lineStart);
    expect(gf.lineEnd).toBe(tf.lineEnd);
    expect(gf.offset).toBe(tf.offset);
    expect(gf.length).toBe(tf.length);
    const only = gf.values[0];
    // SourceValue.continuation is `continuation?: true` (record.ts:5): present
    // only when true, ABSENT otherwise (never the literal false). The merged
    // value is opened by the tagged start, so it must be falsy/absent here.
    expect(only.continuation).toBeFalsy();
    expect(only.line).toBe(tf.values[0].line);
    expect(only.offset).toBe(tf.values[0].offset);
    expect(only.raw.includes("¬")).toBe(true);
  }
}
```
(Field names verified against `record.ts:5-11`: `LogicalRecord.firstLine`/`lastLine`/`orphanContinuations`; `SourceField.lineStart`/`lineEnd`/`offset`/`length`; `SourceValue.line`/`offset`/`raw`/`continuation?: true`. Both facade and oracle share this exact shape — the harness already relied on it via `JSON.stringify` equality.)

- [ ] **Step 2: Point the parse-parity loop at the comparator.**

In `assertParseParity` (`parity.test.ts:53-71`), replace
`expect(JSON.stringify(g)).toBe(JSON.stringify(ts));`
with
`assertFieldLevelParity(g, ts);`
Leave `assertScanParity` unchanged — `scanRecords` is structural and unaffected by cardinality, so scan stays strict whole-record parity.

- [ ] **Step 3: Add the always-run old-vs-new contrast fixture (gate 3's second half).**

Neither committed `.bin` contains a single-value `0xAC` field, so the committed suite never exercises the correction unless we build a synthetic record here (the gleeunit fixture in Task 2 proves the facade side but cannot call the oracle). Add to `test/parity.test.ts` an always-run test that builds a single-value (`OB`) record whose continuation starts with `0xAC` and asserts the **contrast** the spec requires — oracle splits, facade joins:
```ts
// 82-byte line: tag cols 1-2, pad col 3, data from col 4; CRLF at 80-81.
function line(...parts: Array<string | number>): number[] {
  const content: number[] = [];
  for (const p of parts)
    if (typeof p === "string") for (let i = 0; i < p.length; i++) content.push(p.charCodeAt(i));
    else content.push(p);
  const b = new Array(82).fill(0x20);
  for (let i = 0; i < Math.min(content.length, 80); i++) b[i] = content[i]!;
  b[80] = 0x0d; b[81] = 0x0a; return b;
}
const fld = (tag: string, ...d: Array<string | number>) => line(tag, " ", ...d);

it("gate 3: oracle splits a single-value 0xAC field; facade joins it", () => {
  const bytes = new Uint8Array([
    ...line("<< H"), ...line("$$"), ...fld("AN", "9000001"),
    ...fld("OB", "First part"),
    ...fld("  ", 0xac, "quoted tail"), // 0xac is the first DATA byte -> marker
    ...line(">> T"),
  ]);
  const { spans } = tsScan(bytes);
  const span = spans[0]!;
  const ts = tsParse(bytes, span, "synthetic", "fy1991plus", 1);
  const g = gParse(bytes, span, "synthetic", "fy1991plus", 1);
  const tf = ts.fields.find((f: any) => f.tag === "OB")!;
  const gf = g.fields.find((f: any) => f.tag === "OB")!;
  expect(tf.values.length).toBeGreaterThanOrEqual(2); // old reading splits
  expect(gf.values.length).toBe(1);                   // corrected reading joins
  const only = gf.values[0]!; // bind once: values[0] is possibly-undefined under noUncheckedIndexedAccess
  expect(only.raw.includes("¬")).toBe(true);
  expect(only.continuation).toBeFalsy();
});
```
(`fld("  ", 0xac, ...)` puts the pad at col 3 and `0xAC` at col 4 — the byte assembly reads to classify a `MarkedValueStart`.)

- [ ] **Step 4: Run the always-on fixtures.**

Run: `cd packages/cris-formatb && pnpm exec vitest run test/parity.test.ts`
Expected: PASS — the two committed `.bin` fixtures plus the new synthetic contrast test.

- [ ] **Step 5: Run the full app + package suite.**

Run (repo root): `pnpm test`
Expected: PASS — the emulator app suite stays green with the corrected facade (Global Constraint: frozen surface unchanged).

- [ ] **Step 6: Commit.**

```bash
git add packages/cris-formatb/test/parity.test.ts
git commit -m "test(cris-formatb): field-level parity-except-sourced-corrections harness"
```

---

### Task 4: Corpus scan for `0xAC` single-value occurrences (H2) — forensic, uncommitted

**Files:**
- Scratchpad only (throwaway Python): `<scratchpad>/scan_0xac_single_value.py` — NEVER committed.

**Interfaces:** none (produces a report that feeds H3 and confirms gate-2's blast radius).

- [ ] **Step 1: Write the scan.** A stdlib Python script over `data/RG310.CRIS.FY88.txt`, `data/RG164.CRIS.FY89.txt`, `data/RG164.CRIS.FY94.txt`: walk 82-byte lines; track the current open field's tag (a line whose cols 1-2 are a non-blank, non-`$$`/`<<`/`>>` tag opens a field). **Reset the open field at each `$$` record separator** (a marked continuation with no open field in the *current* record is an orphan — it must NOT be attributed to the previous record's tag; the reader assembles per record). Flag every blank-tag continuation line whose first data byte (index 3) is `0xAC` while the open field's tag is in `SINGLE_VALUE_TAGS`. **Collapse hits to field granularity:** emit one hit per (file, record-first-line, tag), not per line — a single field may wrap with several `0xAC` continuations. Record for each: file, record-first-line, tag, and the decoded (latin1) text of the opener + continuation(s).

- [ ] **Step 2: Run it over all three files** (H2 — extend the FY88-only absence scan to the whole served corpus).

Run: `python3 <scratchpad>/scan_0xac_single_value.py`
Expected output: per-file counts by tag, plus one context sample per (file, tag). Record the totals.

- [ ] **Step 3: Cross-check against gate 2 by FIELD SET, not line count.** The differential (Task 3) diverges once per *field*; the scan (Step 1) now emits one hit per *field* too. Compare them as **sets** of `(file, record-first-line, tag)`, not as counts — counting lines would falsely disagree whenever a field wraps with ≥2 markers. The comparator only runs `expect(...)` and emits no list, so to get the differential's set, run the corpus parity once with a throwaway `console.log(JSON.stringify({file, firstLine: ts.firstLine, tag: tf.tag}))` added inside the shaped-differential branch of `assertFieldLevelParity` (remove it after). The two sets must be equal; a genuine difference (not a modelling artifact) means a mis-classified tag or a scan bug — reconcile before trusting either.

- [ ] **Step 4: Save the sample set** (in the scratchpad) for the H3 stratified review, one real merged example per tag that appears. Note the statement-of-absence framing in the H1 sourcing note: the correction is safe to the extent no single-value field is *genuinely* multi-valued, verified by H3, provisional beyond FY88/89/94.

---

### Task 5: Landing gates — full-corpus differential + H3 + H4

**Files:** none (verification + recorded sign-off).

- [ ] **Step 1: Full-corpus parity differential (gates 1-2).**

Run: `cd packages/cris-formatb && CRIS_PARITY_CORPUS=1 pnpm exec vitest run test/parity.test.ts`
Expected: PASS over FY88/FY89/FY94, both profiles. Every difference is a single-value tag on a `0xAC`-bearing field fitting the corrected shape; any failure names a mis-classified tag or an unintended change.

- [ ] **Step 2 (H3 — required human gate): Stratified merge review.**

For every corrected tag that appears in the Task 4 sample set, read at least one real merged value and confirm it reads as continuous prose with a recovered left-quote — NOT two genuinely-distinct values fused. Record which tags were reviewed. Any fusion → that tag was mis-sourced; move it to MultiValue (Task 1) and re-run.

- [ ] **Step 3 (H4 — required human gate): Before/after rendered output.**

Render a sample of changed records through the emulator on the pre-correction commit and on the corrected commit; compare. Confirm the merged form is the more faithful reading. Record the comparison.

- [ ] **Step 4: Final gates + land.**

```bash
cd packages/cris-formatb && gleam format --check src test && gleam check && gleam test && pnpm run build && pnpm run typecheck
cd ../.. && pnpm test
```
Expected: all green. Then land per the user's Ship/Show/Ask choice (do not push without the user's say-so). Record H1/H3/H4 sign-offs in the H1 sourcing note so the correction's human gates are auditable.

---

## Notes for the executor

- Corrections #2 (code-page rendering) and #3 (non-ASCII tags) are **out of scope** — separate specs reuse this harness posture. Do not adopt them here.
- Do not touch the stale `sn_not_yet_modeled` comments (`construct.gleam:890, 970, 1212`) — cosmetic, unrelated.
- If Task 4's scan finds a genuine multi-value single-value field (a real fusion, not a left-quote), STOP: the correction's premise fails for that tag. Re-source (Task 1) before continuing.
- **Zero-hit branch (valid "done"):** if Task 4 finds ZERO single-value `0xAC` fields across FY88/FY89/FY94, the correction is a verified no-op on the served corpus — gate 2 has nothing to assert and H3/H4 are vacuously satisfied. Record that outcome (the fix is proven safe and inert on current data, and still guards future files); do NOT fabricate hits to exercise the gates. This is the plausible outcome given the FY88 narrative-absence finding (`construct.gleam:881-885`).
