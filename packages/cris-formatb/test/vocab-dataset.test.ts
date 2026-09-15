import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VOCAB = join(__dirname, "..", "..", "..", "registry", "vocab");
const FILES = ["rpa-rev-iv-1982.json", "rpa-rev-v-1993.json", "rpa-fy94-table.json"];
const METHODS = new Set(["glm-ocr-audited", "pdftotext-layout", "annual-table"]);
const METHOD_BY_FILE: Record<string, string> = {
  "rpa-rev-iv-1982.json": "glm-ocr-audited",
  "rpa-rev-v-1993.json": "pdftotext-layout",
  "rpa-fy94-table.json": "annual-table",
};

// Fingerprint of a dropped TOC continuation line: a label that ends in a
// trailing comma, or a dangling conjunction/preposition that only makes
// sense followed by more text.
const DANGLING_END = /(,|\b(and|or|from|of|the))$/i;

function loadDataset(f: string) {
  return JSON.parse(readFileSync(join(VOCAB, f), "utf8"));
}

describe("rpa vocab datasets", () => {
  for (const f of FILES) {
    it(`${f} has 98 well-formed rows`, () => {
      const d = loadDataset(f);
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

    it(`${f} labels are clean (non-empty, no dropped-continuation fingerprint)`, () => {
      const d = loadDataset(f);
      for (const r of d.rows) {
        const label: string = r.label;
        expect(label.trim().length).toBeGreaterThan(0);
        expect(label, `code ${r.code} label "${label}" looks truncated`).not.toMatch(DANGLING_END);
      }
    });

    it(`${f} rows all carry method "${METHOD_BY_FILE[f]}"`, () => {
      const d = loadDataset(f);
      for (const r of d.rows) {
        expect(r.method).toBe(METHOD_BY_FILE[f]);
      }
    });
  }

  it("previously-truncated codes carry their full label (pinned regression)", () => {
    // Finding 1: Rev V TOC continuation-line join (dangling-conjunction
    // heuristic above catches the general shape; pin the confirmed examples
    // exactly). Finding 2: FY94 fixed-width field slice for 707 — its
    // truncated form ("TRANS") doesn't end in a comma or conjunction, so it
    // would NOT be caught by the label-cleanliness heuristic; pin it
    // directly instead of inventing an unsound general constraint (a
    // single-word label is legitimate elsewhere, e.g. code 801 "Housing").
    const revV = loadDataset("rpa-rev-v-1993.json");
    const byCode = (d: any, code: string) => d.rows.find((r: any) => r.code === code).label;
    expect(byCode(revV, "210")).toBe(
      "Control of Insects and External Parasites Affecting Livestock, Poultry, Fish, and Other Animals",
    );
    expect(byCode(revV, "502")).toBe("Development of Markets and Efficient Marketing of Timber and Related Products");
    expect(byCode(revV, "802")).toBe(
      "Individual and Family Decision Making and Resource Use and Family Functioning",
    );

    const fy94 = loadDataset("rpa-fy94-table.json");
    expect(byCode(fy94, "707")).toBe("TRANS  ANIML MAN DI");
  });

  it("code sets agree across all three files (IV <-> V <-> FY94 identity)", () => {
    const [iv, v, fy94] = FILES.map((f) => loadDataset(f));
    const codesOf = (d: any) => d.rows.map((r: any) => r.code).sort();
    const ivCodes = codesOf(iv);
    const vCodes = codesOf(v);
    const fy94Codes = codesOf(fy94);
    expect(vCodes).toEqual(ivCodes);
    expect(fy94Codes).toEqual(ivCodes);
  });
});
