import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { justify } from "../../src/dialog/render5";

// The PROGRESS narrative lines are read from the "# not-exercised" block of
// fixtures/bluesheet-sample-1998.txt (the 1998 Blue Sheet sample record's PR text, which the
// synthetic LogicalRecord in test/evidence/render5.test.ts omits, so render5() never emits
// it), instead of being duplicated here as 24 hardcoded literals that could drift from the
// transcription. Each
// comment line has the form `# not-exercised: "<text>" -- <reason>`; the quoted text carries
// render5()'s own 1-space PR-row indent, stripped here to match. Pins render.text.justify's
// width of 65: at 69 this fails.
const bluesheetLines = readFileSync("fixtures/bluesheet-sample-1998.txt", "utf8").split("\n");
const progressStart = bluesheetLines.findIndex(l => l.trim() === "PROGRESS: 8901 TO 8912");
if (progressStart === -1) {
  throw new Error("fixtures/bluesheet-sample-1998.txt is missing its 'PROGRESS: 8901 TO 8912' marker line");
}
const SAMPLE_PR_LINES: string[] = [];
for (let i = progressStart + 1; i < bluesheetLines.length; i++) {
  const match = bluesheetLines[i]!.match(/^# not-exercised: "(.*)" --/);
  if (!match || match[1] === "") break; // end of the PR block's not-exercised run
  SAMPLE_PR_LINES.push(match[1]!.replace(/^ /, "")); // strip render5()'s 1-space PR-row indent
}
if (SAMPLE_PR_LINES.length !== 24) {
  throw new Error(`expected 24 PROGRESS narrative lines from the fixture, got ${SAMPLE_PR_LINES.length}`);
}

const SAMPLE_PR_TEXT = SAMPLE_PR_LINES.map((l) => l.split(/\s+/).join(" ")).join(" ");

test("justify() at the registry width reproduces the sample's PROGRESS narrative line for line", () => {
  expect(justify(SAMPLE_PR_TEXT)).toEqual(SAMPLE_PR_LINES);
});
