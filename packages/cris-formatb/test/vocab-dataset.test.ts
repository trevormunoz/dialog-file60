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
