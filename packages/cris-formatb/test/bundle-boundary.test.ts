// The reader-only bundle boundary (design spec §5.5, Global Constraints):
// dist/engine.mjs must carry none of the validator (`construct`/`Project`/
// `Classifications`) and none of the Node-only deps that power the
// validator's runnable CLI entrypoint (`simplifile`/`argv`/Node `fs`).
//
// A plain substring check on "construct" false-positives: every Gleam
// CustomType class (and the compiled JS classes generic to every bundle)
// emits a real `constructor` -- and "construction"/"constructed" turn up in
// doc comments -- none of which reference the validator's `construct`
// module. Match on a whole word instead, so a real leak (the module path
// "cris_formatb/construct.mjs", or a bare `Project(`/`Classifications(`
// call) still fails loudly.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ENGINE_PATH = new URL("../dist/engine.mjs", import.meta.url);

it("dist bundle is reader-only", () => {
  const src = readFileSync(ENGINE_PATH, "utf8");
  const forbiddenWords = ["construct", "Project", "Classifications"];
  for (const word of forbiddenWords) {
    const found = new RegExp(`\\b${word}\\b`).test(src);
    expect(found, `bundle must not reference the whole word "${word}"`).toBe(
      false,
    );
  }
  const forbiddenSubstrings = ["simplifile", "argv", "node:fs"];
  for (const s of forbiddenSubstrings) {
    expect(src.includes(s), `bundle must not reference "${s}"`).toBe(false);
  }
});
