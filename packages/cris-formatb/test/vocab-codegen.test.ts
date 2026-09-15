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
