import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// In-process only: node:fs only, no subprocess spawning and no git. Spawning
// a subprocess from a test file is forbidden (see
// test/regression/no-subprocess.test.ts) — a subprocess once deadlocked the
// Vitest runner. Drift enforcement (running `gleam format` and comparing)
// lives in scripts/gen-vocab.mjs's `--check` mode instead, which runs as
// part of `prebuild`.

const PKG = join(__dirname, "..");
const GEN = join(PKG, "src", "vocab_rpa.gleam");
const VOCAB = join(PKG, "..", "..", "registry", "vocab");

const SETS = [
  { fn: "rev_iv_label", file: "rpa-rev-iv-1982.json" },
  { fn: "fy94_table_label", file: "rpa-fy94-table.json" },
];

function loadDataset(f: string) {
  return JSON.parse(readFileSync(join(VOCAB, f), "utf8"));
}

// Reverses gleamString()'s encoding (escape \ then "): any backslash-escaped
// character collapses back to the bare character.
function unescapeGleamString(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

// Pull the body of `pub fn <name>(code: String) -> Result(String, Nil) { ... }`
// out of the generated module. The function's own closing brace is the first
// "}" that starts a line (case's closing brace is indented), so a non-greedy
// match up to "\n}\n" lands on exactly that boundary.
function extractFunctionBody(src: string, name: string): string {
  const re = new RegExp(`pub fn ${name}\\(code: String\\) -> Result\\(String, Nil\\) \\{\\n([\\s\\S]*?)\\n\\}\\n`);
  const m = src.match(re);
  if (!m || m[1] === undefined) throw new Error(`could not find function ${name} in generated module`);
  return m[1];
}

// Parse "code -> label" arms out of a function body, tolerant of gleam
// format's line-wrapping of long arms: `\s*` (which matches newlines) covers
// a wrapped `Ok(\n  "..."\n)`, and the optional trailing comma covers the
// trailing-comma form gleam format uses for a wrapped call
// (`Ok(\n  "...",\n)`). Deliberately does NOT collapse whitespace inside the
// body first — the label for code 707 in the FY94 table contains a genuine
// double space ("TRANS  ANIML MAN DI"), which whitespace-collapsing would
// silently corrupt.
function parseArms(body: string): Map<string, string> {
  const armRe = /"(\d{3})"\s*->\s*Ok\(\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\)/g;
  const arms = new Map<string, string>();
  for (const m of body.matchAll(armRe)) {
    // Both groups are required (non-optional) in armRe, so a match always
    // carries both — the `!` just satisfies noUncheckedIndexedAccess.
    arms.set(m[1]!, unescapeGleamString(m[2]!));
  }
  return arms;
}

describe("vocab codegen", () => {
  it("generated module contains a known code and its set labels", () => {
    const src = readFileSync(GEN, "utf8");
    expect(src).toContain(`"101" -> Ok(`);
    expect(src).toContain('rev_iv_set_label: String = "Rev IV RPA set (glm-ocr-audited)"');
    expect(src).toContain('fy94_table_set_label: String = "FY94 table RPA set (annual-table)"');
  });

  for (const s of SETS) {
    it(`${s.fn} arms exactly match ${s.file} (semantic drift guard)`, () => {
      const src = readFileSync(GEN, "utf8");
      const body = extractFunctionBody(src, s.fn);
      const generatedArms = parseArms(body);

      const dataset = loadDataset(s.file);
      const expectedArms = new Map<string, string>(dataset.rows.map((r: { code: string; label: string }) => [r.code, r.label]));

      expect(generatedArms.size).toBe(expectedArms.size);
      for (const [code, label] of expectedArms) {
        expect(generatedArms.get(code), `code ${code} missing or mismatched in generated ${s.fn}`).toBe(label);
      }
      // No extra codes in the generated module beyond the dataset.
      for (const code of generatedArms.keys()) {
        expect(expectedArms.has(code), `generated ${s.fn} has unexpected code ${code}`).toBe(true);
      }
    });
  }
});
