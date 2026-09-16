# RPA Vocabulary Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the CRIS RPA (Research Problem Area) code sets from the classification manuals + FY94 annual table into a citable dataset, compile them into the Gleam validator, and add a vintage-scoped "not attested" check for the RP column.

**Architecture:** Authored JSON datasets under `registry/vocab/` are the source of truth; a build-time codegen step turns the two warrant sets into a generated Gleam `case`-function module; a pure `rpa_attestation` module canonicalizes an RP value and looks it up; a new opt-in vintaged entry point in `construct.gleam` emits a typed `RpaCodeNotAttested` problem on a miss. The existing `project(record)` entry, the facade, and the current tallies are left byte-identical (collision-safe: another agent is integrating the facade concurrently).

**Tech Stack:** Gleam (JavaScript target, `gleam test`/gleeunit), TypeScript boundary tests (vitest), Node ESM codegen (`.mjs`), JSON datasets.

## Global Constraints

- Validator (Gleam) does **no runtime file I/O**: the vocabulary reaches it only as a generated Gleam module.
- Dataset rows are **all facts, no interpretive grade**: `{ code, label, source_page, method }`, `method` ∈ `glm-ocr-audited | pdftotext-layout | annual-table`.
- The RPA code set is **98 codes** (measured, identical across four sources); the `101–908` range is sparse — a gap-in-range is not a dropped code.
- **Do not modify** `src/facade.gleam`, `src/cris_formatb.gleam`, or the TS facade surface — another agent is integrating there. Keep `construct.project(record)` and all existing tallies byte-identical.
- Warrant map: FY88/FY89 → Rev IV set; FY94 → FY94 table set; any other FY → no warrant (check not run). Rev V is extracted as a witness/artifact only, **not** compiled into the validator.
- A miss is a **statement of absence**, never a verdict: rendered wording is provisional and names the set + extraction method.
- Gleam package builds via `pnpm run build` in `packages/cris-formatb/` (`gleam build --target javascript && esbuild … && rollup …`); `pretest`/`pretypecheck` both run `pnpm run build`. Gleam unit tests run with `gleam test`.
- Commits: `type(scope): subject` (scope `cris-formatb`); end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- All work stays in the worktree `.claude/worktrees/rpa-vocab-validator`.

**Source material (external to this repo):** the RO-Crate at
`/private/tmp/claude-501/-Users-trevormunoz-Code-barcstory-dialog-file60-docs-formatb-reading/54fc3ba0-fa66-4b14-8638-910f36efd436/scratchpad/ro-crate/`
(`manual-rev-iv-1982.glm.md`, `manual-rev-v-1993.pdf`, `manual-rev-v-1993.wpd`, `tables/94tables.txt`, and `manual-rev-iv-1982.pdf` for the IA-OCR witness). Extraction reads these; only the JSON output is committed. The verified measurement scripts already exist at `…/scratchpad/rpa-measure/`.

---

### Task 1: RPA vocabulary datasets (extract + verify)

Produce the three committed datasets and prove the extraction is faithful (dual-witness + cross-source diffs, human residue check). This task's deliverable is the JSON + a dataset test; the extraction script is throwaway (scratchpad).

**Files:**
- Create: `registry/vocab/rpa-rev-iv-1982.json`
- Create: `registry/vocab/rpa-rev-v-1993.json`
- Create: `registry/vocab/rpa-fy94-table.json`
- Create (scratchpad, not committed): `…/scratchpad/rpa-extract/extract.py`
- Test: `packages/cris-formatb/test/vocab-dataset.test.ts`

**Interfaces:**
- Produces: three JSON files, each an object `{ source, issue_date, source_file, sha256, extracted, searched_scope, code_count, rows: [ { code, label, source_page, method } ] }`. `rows` sorted by `code`, unique 3-digit codes. `method`: Rev IV = `glm-ocr-audited`, Rev V = `pdftotext-layout`, FY94 table = `annual-table`.

- [ ] **Step 1: Write the failing dataset test**

```ts
// packages/cris-formatb/test/vocab-dataset.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VOCAB = join(__dirname, "..", "..", "..", "registry", "vocab");
const FILES = ["rpa-rev-iv-1982.json", "rpa-rev-v-1993.json", "rpa-fy94-table.json"];
const METHODS = new Set(["glm-ocr-audited", "pdftotext-layout", "annual-table"]);

describe("rpa vocab datasets", () => {
  for (const f of FILES) {
    it(`${f} has 98 well-formed rows`, () => {
      const d = JSON.parse(readFileSync(join(VOCAB, f), "utf8"));
      expect(d.rows).toHaveLength(98);
      expect(d.code_count).toBe(98);
      expect(METHODS.has(d.rows[0].method)).toBe(true);
      const codes = d.rows.map((r: any) => r.code);
      expect(new Set(codes).size).toBe(98); // unique
      expect([...codes].sort()).toEqual(codes); // sorted
      for (const r of d.rows) {
        expect(r.code).toMatch(/^\d{3}$/);
        expect(typeof r.label).toBe("string");
        expect(Number.isInteger(r.source_page)).toBe(true);
        expect(METHODS.has(r.method)).toBe(true);
      }
      expect(typeof d.searched_scope).toBe("string");
    });
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/cris-formatb && pnpm exec vitest run test/vocab-dataset.test.ts`
Expected: FAIL (files do not exist / cannot read).

- [ ] **Step 3: Write the extraction script** (scratchpad), adapting `…/scratchpad/rpa-measure/extract.py`. It must, per source, emit rows `{code,label,source_page,method}`:
  - Rev IV: parse `manual-rev-iv-1982.glm.md` TOC lines `NNN Label pagenum`; strip the trailing dot-leader from labels; `method="glm-ocr-audited"`.
  - Rev V: `pdftotext -layout manual-rev-v-1993.pdf -`, parse the TOC region; `method="pdftotext-layout"`.
  - FY94 table: parse `tables/94tables.txt` Table D rows `NNN LABEL …`, excluding `Goal Total` lines and `990 UNCLASSIFIED`; `method="annual-table"`. `source_page` = 0 for the table (text file; record the line number instead is acceptable — document which).
  - Compute `sha256` of each source file and a `searched_scope` string from the parsed page/section range.

- [ ] **Step 4: Run the verification diffs** (adapt `…/scratchpad/rpa-measure/diff.py`). Assert, and STOP if any fails:
  - Each source yields exactly **98** codes.
  - Rev IV(GLM) ↔ Rev IV(IA-OCR from `pdftotext manual-rev-iv-1982.pdf -`): code sets identical.
  - Rev IV(GLM) ↔ Rev V ↔ FY94 table: code sets identical (label diffs allowed — real IV→V drift).
  - **Residue checkpoint:** any code-level disagreement (> 0) → stop and adjudicate against the Rev IV page images before proceeding. (Measured baseline: 0 disagreements.)

- [ ] **Step 5: Write the three JSON files** to `registry/vocab/` with headers + sorted unique rows.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/cris-formatb && pnpm exec vitest run test/vocab-dataset.test.ts`
Expected: PASS (3 files × assertions).

- [ ] **Step 7: Commit**

```bash
git add registry/vocab/rpa-rev-iv-1982.json registry/vocab/rpa-rev-v-1993.json registry/vocab/rpa-fy94-table.json packages/cris-formatb/test/vocab-dataset.test.ts
git commit -m "feat(cris-formatb): extract RPA code sets (Rev IV, Rev V, FY94 table) to registry/vocab

98 codes each, dual-witness verified (IA/GLM, PDF/WPD, cross-source): 0 disagreements.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add the `ClassificationSource` evidence grade

The RPA rule is warranted by the Manual/tables, not the `367_1DP` layout dictionary; none of the three existing grades can honestly label it. Add one variant.

**Files:**
- Modify: `packages/cris-formatb/src/record_model.gleam:79-93` (the `EvidenceGrade` type + its doc block)
- Test: `packages/cris-formatb/test/record_model_test.gleam`

**Interfaces:**
- Produces: `record_model.ClassificationSource : EvidenceGrade`.

- [ ] **Step 1: Write the failing test** — append to `test/record_model_test.gleam`:

```gleam
pub fn classification_source_grade_exists_test() {
  let rule =
    record_model.RuleRef(
      document: "Manual of Classification (Rev IV, 1982)",
      pdf_page: 0,
      element: "RPA (35)",
      assertion: "code appears in the contemporary CRIS RPA classification",
      interpretation: "vocabulary attestation, provisional",
      stage: record_model.Supplied,
      evidence: record_model.ClassificationSource,
    )
  rule.evidence |> should.equal(record_model.ClassificationSource)
}
```

(If `record_model_test.gleam` does not already `import gleeunit/should`, add it.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — `ClassificationSource` is not a constructor of `EvidenceGrade`.

- [ ] **Step 3: Add the variant** — extend the type at `record_model.gleam:90-93` and its doc block:

```gleam
/// … existing doc block … `ValidationAddendum` … never on a dictionary row for
/// the field itself. Weaker than a printed row, and not to be mistaken for one.
///
/// `ClassificationSource` is a fourth, separate grade for rules warranted by the
/// Manual of Classification editions or the CRIS annual tables — the *meaning*
/// codebook, a different document class from the 367_1DP layout dictionary the
/// other three grades cite. Per-source fidelity (OCR vs born-digital) is NOT
/// carried here; it lives in the vocabulary dataset's `method` field.
pub type EvidenceGrade {
  PrintedDictionary
  HandwrittenAmendment
  ValidationAddendum
  ClassificationSource
}
```

- [ ] **Step 4: Run the full Gleam suite** to catch exhaustiveness fallout from the new variant.

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS. If any `case … : EvidenceGrade` becomes non-exhaustive, add a `ClassificationSource` arm there (grep: `rg "EvidenceGrade|PrintedDictionary" packages/cris-formatb/src`). Fix each until green.

- [ ] **Step 5: Commit**

```bash
git add packages/cris-formatb/src/record_model.gleam packages/cris-formatb/test/record_model_test.gleam
git commit -m "feat(cris-formatb): add ClassificationSource evidence grade for Manual-warranted rules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Codegen the generated vocab module + wire the staleness gate

Turn the two **warrant** datasets (Rev IV, FY94 table — not Rev V) into a generated Gleam module of `case` functions, and hook regeneration into the existing build gate so JSON↔generated drift fails the build.

**Files:**
- Create: `packages/cris-formatb/scripts/gen-vocab.mjs`
- Create (generated, committed): `packages/cris-formatb/src/vocab_rpa.gleam`
- Modify: `packages/cris-formatb/package.json:18-26` (add `prebuild`)
- Test: `packages/cris-formatb/test/vocab-codegen.test.ts`

**Interfaces:**
- Produces (Gleam): `vocab_rpa.rev_iv_label(String) -> Result(String, Nil)`, `vocab_rpa.fy94_table_label(String) -> Result(String, Nil)`, and consts `vocab_rpa.rev_iv_set_label: String`, `vocab_rpa.fy94_table_set_label: String` (each a human label including the method, e.g. `"Rev IV RPA set (glm-ocr-audited)"`).

- [ ] **Step 1: Write the failing codegen test**

```ts
// packages/cris-formatb/test/vocab-codegen.test.ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PKG = join(__dirname, "..");
const GEN = join(PKG, "src", "vocab_rpa.gleam");

describe("vocab codegen", () => {
  it("generated module contains a known code and its set labels", () => {
    const src = readFileSync(GEN, "utf8");
    expect(src).toContain(`"101" -> Ok(`);
    expect(src).toContain("glm-ocr-audited");
    expect(src).toContain("annual-table");
  });

  it("generated module is in sync with the JSON (no drift)", () => {
    // Regenerate; the working tree must stay clean.
    execFileSync("node", [join(PKG, "scripts", "gen-vocab.mjs")], { cwd: PKG });
    const diff = execFileSync("git", ["diff", "--exit-code", "--", "src/vocab_rpa.gleam"], {
      cwd: PKG,
      encoding: "utf8",
    });
    expect(diff).toBe("");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd packages/cris-formatb && pnpm exec vitest run test/vocab-codegen.test.ts`
Expected: FAIL (generated module absent).

- [ ] **Step 3: Write `scripts/gen-vocab.mjs`**

```js
// packages/cris-formatb/scripts/gen-vocab.mjs
// Generates src/vocab_rpa.gleam from the two warrant datasets. Authored JSON is
// the source of truth; this module is derived and never hand-edited.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const vocabDir = join(here, "..", "..", "..", "registry", "vocab");
const out = join(here, "..", "src", "vocab_rpa.gleam");

const SETS = [
  { fn: "rev_iv_label", label: "rev_iv_set_label", set: "Rev IV RPA set", file: "rpa-rev-iv-1982.json" },
  { fn: "fy94_table_label", label: "fy94_table_set_label", set: "FY94 table RPA set", file: "rpa-fy94-table.json" },
];

function gleamString(s) {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

let body = "//// GENERATED by scripts/gen-vocab.mjs from registry/vocab/*.json. Do not edit.\n\n";
for (const s of SETS) {
  const data = JSON.parse(readFileSync(join(vocabDir, s.file), "utf8"));
  body += `pub const ${s.label}: String = ${gleamString(`${s.set} (${data.rows[0].method})`)}\n\n`;
  body += `pub fn ${s.fn}(code: String) -> Result(String, Nil) {\n  case code {\n`;
  for (const r of data.rows) {
    body += `    ${gleamString(r.code)} -> Ok(${gleamString(r.label)})\n`;
  }
  body += "    _ -> Error(Nil)\n  }\n}\n\n";
}
writeFileSync(out, body);
execFileSync("gleam", ["format", out], { cwd: join(here, "..") });
console.log(`wrote ${out}`);
```

- [ ] **Step 4: Run it once to generate the module**

Run: `cd packages/cris-formatb && node scripts/gen-vocab.mjs`
Expected: writes `src/vocab_rpa.gleam` (98 arms per set), `gleam format`-clean.

- [ ] **Step 5: Wire regeneration into the build gate** — add a `prebuild` script so every `pnpm run build` (hence every `pretest`/`pretypecheck`) regenerates first. Edit `packages/cris-formatb/package.json` scripts:

```json
    "prebuild": "node scripts/gen-vocab.mjs",
    "build": "gleam build --target javascript && esbuild scripts/engine-entry.mjs --bundle --format=esm --platform=neutral --outfile=dist/engine.mjs && rollup --config scripts/rollup-dts.config.mjs",
```

- [ ] **Step 6: Run the codegen test to verify it passes**

Run: `cd packages/cris-formatb && pnpm exec vitest run test/vocab-codegen.test.ts`
Expected: PASS (known code present; `git diff` on the committed generated file is empty).

- [ ] **Step 7: Commit**

```bash
git add packages/cris-formatb/scripts/gen-vocab.mjs packages/cris-formatb/src/vocab_rpa.gleam packages/cris-formatb/package.json packages/cris-formatb/test/vocab-codegen.test.ts
git commit -m "feat(cris-formatb): codegen vocab_rpa module from datasets, gated on drift

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: The pure `rpa_attestation` module

Isolated, fully unit-testable logic: warrant selection, best-effort normalization, and the attestation lookup. No dependency on `construct.gleam`'s problem types.

**Files:**
- Create: `packages/cris-formatb/src/rpa_attestation.gleam`
- Test: `packages/cris-formatb/test/rpa_attestation_test.gleam`

**Interfaces:**
- Produces:
  - `pub type WarrantSet { RevIv Fy94Table NoWarrant }`
  - `pub fn warrant_for(fy: Int) -> WarrantSet`
  - `pub fn canonical_code(value: String) -> Result(String, Nil)` — strip one leading `"R"` if present, then `Ok(code)` iff the remainder is exactly 3 digits, else `Error(Nil)`.
  - `pub type RpaMiss { RpaMiss(code: String, set_label: String) }`
  - `pub fn attest(value: String, set: WarrantSet) -> Result(Nil, RpaMiss)` — `Ok(Nil)` when `NoWarrant`, when `canonical_code` fails (best-effort skip), or when the code is found; `Error(RpaMiss(code, set_label))` when a canonical code is absent from a real warrant set.

- [ ] **Step 1: Write the failing tests**

```gleam
// packages/cris-formatb/test/rpa_attestation_test.gleam
import gleeunit/should
import rpa_attestation.{Fy94Table, NoWarrant, RevIv, RpaMiss}

pub fn warrant_for_maps_fy_test() {
  rpa_attestation.warrant_for(88) |> should.equal(RevIv)
  rpa_attestation.warrant_for(89) |> should.equal(RevIv)
  rpa_attestation.warrant_for(94) |> should.equal(Fy94Table)
  rpa_attestation.warrant_for(90) |> should.equal(NoWarrant)
}

pub fn canonical_code_strips_optional_r_test() {
  rpa_attestation.canonical_code("R101") |> should.equal(Ok("101"))
  rpa_attestation.canonical_code("101") |> should.equal(Ok("101"))
  rpa_attestation.canonical_code("R1015") |> should.equal(Error(Nil))
  rpa_attestation.canonical_code("A4100") |> should.equal(Error(Nil))
}

pub fn attest_known_code_passes_test() {
  rpa_attestation.attest("R101", RevIv) |> should.equal(Ok(Nil))
}

pub fn attest_unknown_code_misses_test() {
  rpa_attestation.attest("R999", RevIv)
  |> should.equal(Error(RpaMiss("999", rpa_attestation.set_label(RevIv))))
}

pub fn attest_no_warrant_skips_test() {
  rpa_attestation.attest("R999", NoWarrant) |> should.equal(Ok(Nil))
}

pub fn attest_uncanonicalizable_skips_test() {
  rpa_attestation.attest("A4100", RevIv) |> should.equal(Ok(Nil))
}
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — module `rpa_attestation` not found.

- [ ] **Step 3: Write the module**

```gleam
// packages/cris-formatb/src/rpa_attestation.gleam
import gleam/int
import gleam/string
import vocab_rpa

pub type WarrantSet {
  RevIv
  Fy94Table
  NoWarrant
}

pub type RpaMiss {
  RpaMiss(code: String, set_label: String)
}

pub fn warrant_for(fy: Int) -> WarrantSet {
  case fy {
    88 | 89 -> RevIv
    94 -> Fy94Table
    _ -> NoWarrant
  }
}

pub fn set_label(set: WarrantSet) -> String {
  case set {
    RevIv -> vocab_rpa.rev_iv_set_label
    Fy94Table -> vocab_rpa.fy94_table_set_label
    NoWarrant -> "no warrant set"
  }
}

/// Strip one leading "R" if present, then accept iff exactly 3 digits remain.
pub fn canonical_code(value: String) -> Result(String, Nil) {
  let digits = case string.starts_with(value, "R") {
    True -> string.drop_start(value, 1)
    False -> value
  }
  case string.length(digits) == 3 && is_all_digits(digits) {
    True -> Ok(digits)
    False -> Error(Nil)
  }
}

fn is_all_digits(s: String) -> Bool {
  case int.parse(s) {
    Ok(_) -> string.length(s) == string.length(string.trim(s))
    Error(_) -> False
  }
}

pub fn attest(value: String, set: WarrantSet) -> Result(Nil, RpaMiss) {
  case set {
    NoWarrant -> Ok(Nil)
    _ ->
      case canonical_code(value) {
        Error(_) -> Ok(Nil)
        Ok(code) ->
          case lookup(code, set) {
            Ok(_) -> Ok(Nil)
            Error(_) -> Error(RpaMiss(code, set_label(set)))
          }
      }
  }
}

fn lookup(code: String, set: WarrantSet) -> Result(String, Nil) {
  case set {
    RevIv -> vocab_rpa.rev_iv_label(code)
    Fy94Table -> vocab_rpa.fy94_table_label(code)
    NoWarrant -> Error(Nil)
  }
}
```

Note: `int.parse` accepts a leading `-`/`+`; `is_all_digits` uses trim-equality as a guard. If a stricter digit check is preferred, replace with a per-codepoint `0`–`9` check. Verify `string.drop_start`/`string.trim` names against the installed `gleam_stdlib` version (Task requires `gleam test` green, which will surface any rename).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS (all `rpa_attestation` tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cris-formatb/src/rpa_attestation.gleam packages/cris-formatb/test/rpa_attestation_test.gleam
git commit -m "feat(cris-formatb): pure RPA attestation (warrant map, normalization, lookup)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Add the `RpaCodeNotAttested` disagreement kind + render/tally arms

**Files:**
- Modify: `packages/cris-formatb/src/record_model.gleam:107-114` (`DisagreementKind`)
- Modify: `packages/cris-formatb/src/report.gleam:235-254` (`describe_kind`)
- Modify: `packages/cris-formatb/src/tally.gleam:160-169` (`kind_bucket`)
- Test: `packages/cris-formatb/test/report_test.gleam` (or the file where `describe_kind` is exercised)

**Interfaces:**
- Produces: `record_model.RpaCodeNotAttested(code: String, warrant_set: String) : DisagreementKind`.

- [ ] **Step 1: Write the failing render test** — add to the report test module:

```gleam
pub fn describe_rpa_not_attested_test() {
  report.describe_kind(record_model.RpaCodeNotAttested("514", "Rev IV RPA set (glm-ocr-audited)"))
  |> should.equal("RPA 514 not attested in Rev IV RPA set (glm-ocr-audited)")
}
```

(If `describe_kind` is not `pub`, exercise it through the existing public report path used by the neighboring tests instead, matching their call style.)

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — `RpaCodeNotAttested` not a constructor.

- [ ] **Step 3: Add the variant** at `record_model.gleam:107-114`:

```gleam
pub type DisagreementKind {
  RequiredFieldNotLocated(tag: String)
  NonRepeatingFieldRepeated(tag: String, occurrences: Int)
  InvalidAccession(reason: AccessionError)
  InvalidFieldValue(tag: String, reason: String)
  RepetitionLimitExceeded(tag: String, actual: Int, maximum: Int)
  RelatedFieldsDisagree(tags: NonEmpty(String), reason: String)
  RpaCodeNotAttested(code: String, warrant_set: String)
}
```

- [ ] **Step 4: Add the `describe_kind` arm** at `report.gleam` (inside the `case kind`):

```gleam
    RpaCodeNotAttested(code, warrant_set) ->
      "RPA " <> code <> " not attested in " <> warrant_set
```

- [ ] **Step 5: Add the `kind_bucket` arm** at `tally.gleam` (inside the `case kind`):

```gleam
    RpaCodeNotAttested(_, _) -> "RP rpa-not-attested"
```

- [ ] **Step 6: Run the suite (exhaustiveness now satisfied)**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS. If other `case … : DisagreementKind` sites exist, the compiler will name them; add the same-shaped arm.

- [ ] **Step 7: Commit**

```bash
git add packages/cris-formatb/src/record_model.gleam packages/cris-formatb/src/report.gleam packages/cris-formatb/src/tally.gleam packages/cris-formatb/test/report_test.gleam
git commit -m "feat(cris-formatb): RpaCodeNotAttested disagreement kind + render/tally arms

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire attestation into an opt-in vintaged entry point

Add `project_with_vintage`; leave `project(record)`, the facade, and existing tallies byte-identical (collision-safe). Attestation runs only when a corpus FY is supplied.

**Files:**
- Modify: `packages/cris-formatb/src/construct.gleam` (add `project_with_vintage`, `classification_rule`, and the attestation pass; keep `project` as a delegating wrapper)
- Test: `packages/cris-formatb/test/construct_test.gleam`

**Interfaces:**
- Consumes: `rpa_attestation.{warrant_for, attest, RpaMiss}`; `record_model.RpaCodeNotAttested`; the existing `disagreement(...)`, `Disagreement`, and the constructed `Classifications.columns.problem : List(Supported(String))`.
- Produces:
  - `pub fn project(record: SuppliedRecord) -> record_model.ConstructionResult` (unchanged behavior; now delegates).
  - `pub fn project_with_vintage(record: SuppliedRecord, corpus_fy: option.Option(Int)) -> record_model.ConstructionResult`.

- [ ] **Step 0: Confirm the `ConstructionResult` shape** — read `record_model.gleam` for `ConstructionResult` and the `Project` accessor for the classification `problem` column (e.g. `project_classifications`/`columns`). The merge in Step 3 must match its real constructors. (This is a 2-minute read; do not guess.)

- [ ] **Step 1: Write the failing tests** — add to `construct_test.gleam`:

```gleam
pub fn rpa_unattested_reports_for_fy88_test() {
  let supplied = full_record_with_rp("R999")
  let assert Error(problems) =
    construct.project_with_vintage(supplied, Some(88))
  has_rpa_not_attested(problems, "999") |> should.equal(True)
}

pub fn rpa_attested_code_is_clean_for_fy88_test() {
  let supplied = full_record_with_rp("R101")
  construct.project_with_vintage(supplied, Some(88))
  |> is_ok
  |> should.equal(True)
}

pub fn rpa_check_skipped_without_vintage_test() {
  let supplied = full_record_with_rp("R999")
  // No corpus FY -> attestation not run; matches plain project().
  construct.project_with_vintage(supplied, None)
  |> is_ok
  |> should.equal(True)
}
```

Add small test helpers next to the existing fixtures: `full_record_with_rp(code)` = `full_record_pairs()` with the `RP` pair replaced by `#("RP", code)`, fed through `record(...)`; `has_rpa_not_attested(problems, code)` folds the `NonEmpty` looking for `Disagreement(FormatDisagreement(RpaCodeNotAttested(c, _), _, _, _))` with `c == code`; `is_ok` maps a `ConstructionResult` to `Bool`. Match the `NonEmpty`/`Disagreement` destructuring already used at `construct_test.gleam:460`.

- [ ] **Step 2: Run to confirm it fails**

Run: `cd packages/cris-formatb && gleam test`
Expected: FAIL — `project_with_vintage` not defined.

- [ ] **Step 3: Implement** in `construct.gleam`:

```gleam
// Delegating wrapper — existing callers and the facade are unchanged.
pub fn project(record: SuppliedRecord) -> record_model.ConstructionResult {
  project_with_vintage(record, option.None)
}

pub fn project_with_vintage(
  record: SuppliedRecord,
  corpus_fy: option.Option(Int),
) -> record_model.ConstructionResult {
  let base = project_core(record)
  // `project_core` is the current body of `project` (rename the existing
  // function; its behavior is unchanged).
  case corpus_fy {
    option.None -> base
    option.Some(fy) -> merge_rpa_attestations(base, record, fy)
  }
}

fn classification_rule(set_label: String) -> RuleRef {
  RuleRef(
    document: set_label,
    pdf_page: 0,
    element: "RPA (35)",
    assertion: "code appears in the contemporary CRIS RPA classification",
    interpretation: "vocabulary attestation, provisional statement of absence",
    stage: Supplied,
    evidence: ClassificationSource,
  )
}
```

`merge_rpa_attestations` builds one `RpaCodeNotAttested` problem per miss from the constructed RP column and folds it into the result. Sketch (adjust to the real `ConstructionResult`/`Project` accessors confirmed in Step 0):

```gleam
fn merge_rpa_attestations(
  base: record_model.ConstructionResult,
  record: SuppliedRecord,
  fy: Int,
) -> record_model.ConstructionResult {
  let set = rpa_attestation.warrant_for(fy)
  // Re-run the RP column read so we have each value + its locations, without
  // depending on `base` being Ok. `flat_values` is the existing reader used by
  // `bounded_repeating` (construct.gleam:1616).
  let #(values, _extraction) = flat_values(record, "RP")
  let misses =
    list.filter_map(values, fn(pair) {
      let #(bytes, occurrence) = pair
      case bit_array.to_string(bytes) {
        Error(_) -> Error(Nil)
        Ok(text) ->
          case rpa_attestation.attest(text, set) {
            Ok(Nil) -> Error(Nil)
            Error(miss) -> Ok(rpa_problem(miss, occurrence))
          }
      }
    })
  append_problems(base, misses)
}

fn rpa_problem(
  miss: rpa_attestation.RpaMiss,
  occurrence: FieldOccurrence,
) -> ConstructionProblem {
  disagreement(
    record_model.RpaCodeNotAttested(miss.code, miss.set_label),
    classification_rule(miss.set_label),
    locations(occurrence),
    "checked RPA code against the " <> miss.set_label,
  )
}
```

`append_problems(result, [])` returns `result` unchanged; with a non-empty list it turns `Ok(_)` into `Error(NonEmpty(first, rest))` and appends to an existing `Error(NonEmpty(...))`. Implement it against the confirmed `ConstructionResult` type from Step 0.

- [ ] **Step 4: Run the full suite**

Run: `cd packages/cris-formatb && gleam test`
Expected: PASS (new tests + all existing — `project(record)` behavior is unchanged, so prior tests and tallies stay green).

- [ ] **Step 5: Run the build gate + TS boundary tests** (no regressions, facade untouched)

Run: `cd packages/cris-formatb && pnpm run build && pnpm test`
Expected: PASS. Confirm `git status` shows no change to `src/facade.gleam` / `src/cris_formatb.gleam`.

- [ ] **Step 6: Commit**

```bash
git add packages/cris-formatb/src/construct.gleam packages/cris-formatb/test/construct_test.gleam
git commit -m "feat(cris-formatb): opt-in vintaged RP attestation via project_with_vintage

project(record) unchanged; attestation runs only when a corpus FY is supplied.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Follow-up (explicitly out of this slice)

- **Passing real corpus FY through the facade/emulator** so attestation runs on FY88/FY89/FY94 corpora and its runtime yield can be measured. Deferred to avoid colliding with the concurrent facade integration; `project_with_vintage` is the seam it will call.
- **The `pending` member cards** in the barcstory workspace (`cris-manual/`), a different repo — the datasets here are their input.
- The other six classification columns; Revisions VI/X; FY93 (pending base-reader certification) and FY95/FY96 tables.

## Self-Review

**Spec coverage:** dataset extraction + verification (Task 1) ✓; searched-scope header (Task 1 Step 3/5) ✓; all-facts rows / no grade (Task 1) ✓; `ClassificationSource` grade (Task 2) ✓; codegen `case` functions + drift gate on the existing build step (Task 3) ✓; best-effort normalization, no new shape reject (Task 4 `canonical_code`/`attest`) ✓; warrant map with `NoWarrant` no-silent-skip (Task 4 `warrant_for`, Task 6 `None`/`NoWarrant` paths) ✓; `RpaCodeNotAttested` via the `FormatDisagreement` envelope + render/tally arms (Task 5) ✓; method surfaced via the set label in the render (Task 3 label const → Task 5 render) ✓; facade untouched / `project` byte-identical (Task 6) ✓. Rev V extracted but not compiled ✓ (Task 1 produces it; Task 3 omits it). Runtime-yield left unmeasured ✓ (Follow-up).

**Placeholder scan:** no TBD/TODO; every code step shows code; two explicit "confirm the real type/stdlib name" reads (Task 6 Step 0, Task 4 Step 3 note) are verification steps, not placeholders.

**Type consistency:** `RpaCodeNotAttested(code, warrant_set)` used identically in record_model / report / tally / construct; `RpaMiss(code, set_label)` and `set_label`/`warrant_for`/`attest`/`canonical_code` names match between Task 4 definition and Task 6 use; `rev_iv_label`/`fy94_table_label`/`rev_iv_set_label`/`fy94_table_set_label` match between Task 3 codegen and Task 4 lookups.
