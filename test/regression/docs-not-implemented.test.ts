import { readFileSync } from "node:fs";

// docs/not-implemented.md's "What is not implemented" section has to name the real gaps a
// reader would otherwise assume were implemented -- BEGIN's accounting block, TYPE format 6
// and user-defined formats, and the subfile limits. This pins the section's substance so the
// list cannot go stale.
test("docs/not-implemented.md names the real gaps", () => {
  const doc = readFileSync("docs/not-implemented.md", "utf8");
  const section = doc.split("## What is not implemented")[1]?.split("## ")[0] ?? "";
  expect(section).not.toBe("");
  for (const phrase of [
    "accounting block",
    "format 6",
    "user-defined format",
    "subfile limit",
    // A capability-notice stub exists (EXPAND, PAGE, DISPLAY SETS, LOGOFF, SORT, PRINT,
    // KWIC, TYPE by accession number), so the section names the notice rather than
    // claiming no notice exists at all.
    "capability notice",
    "TYPE by accession number",
    "the offending token",
    // A phrase index is built for only six of the phrase prefixes the 1998 Blue Sheet
    // documents; every other one routes to the capability-notice channel rather than being
    // unnamed and indistinguishable from a typo.
    "CY, IN, DS, ST, SF, AN",
    "every other",
  ]) {
    expect(section.toLowerCase(), `expected the not-implemented section to mention "${phrase}"`).toContain(phrase.toLowerCase());
  }
});
