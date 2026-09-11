import { readFileSync } from "node:fs";

// docs/not-implemented.md's "What is not implemented" section has to name the real gaps a
// reader would otherwise assume were implemented -- TYPE format 6 and user-defined formats,
// the subfile limits, RANK, COMBINE, and the accounting block's Descriptors line.
// EXPAND, PAGE, DISPLAY SETS, SELECT STEPS, LOGOFF's accounting block (Types and, as of Task
// 6, Prints), PRINT by set number, and OR/NOT are implemented now, so their names are not
// pinned here as gaps. This pins the section's substance so the list cannot go stale.
test("docs/not-implemented.md names the real gaps", () => {
  const doc = readFileSync("docs/not-implemented.md", "utf8");
  const section = doc.split("## What is not implemented")[1]?.split("## ")[0] ?? "";
  expect(section).not.toBe("");
  for (const phrase of [
    "format 6",
    "user-defined format",
    "subfile limit",
    "set detail on",
    "rank",
    "combine",
    "descriptors line",
    "onesearch",
    // A capability-notice stub exists (SORT, PRINT by accession number, KWIC, TYPE by
    // accession number), so the section names the notice rather than claiming no notice
    // exists at all.
    "capability notice",
    "TYPE by accession number",
    "PRINT by accession number",
    "the offending token",
    // PRINT (by set number) is implemented as of Task 6, but produces no artefact, does not
    // apply its own sort codes, and cannot price a format-K set (the 1998 rate card's Prints
    // price for KWIC formats is illegible) -- each a named gap, not silence.
    "produce an artefact",
    "apply its sort codes",
    "price a print of format k",
    "era/copies/redist",
    // A phrase index is built for every documented File 60 prefix except SP, whose Format B
    // tag is HNRIMS-only and has a measured count of 0 on this corpus; SP routes to the
    // capability-notice channel rather than being unnamed and indistinguishable from a typo.
    "every one of them except",
    "hnrims-only",
  ]) {
    expect(section.toLowerCase(), `expected the not-implemented section to mention "${phrase}"`).toContain(phrase.toLowerCase());
  }
});
