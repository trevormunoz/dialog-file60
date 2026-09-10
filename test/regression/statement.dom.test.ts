// @vitest-environment happy-dom
//
// src/app/main.ts's refresh() rewrites the statement panel's innerHTML on restart and on a
// display-mode change, so a reader's SHA-256 "show full" reveal would
// silently collapse -- the checkbox in the fresh markup is unchecked by construction.
// setStatementHtml is the fix: it reads the checkbox's checked state before the rewrite and
// restores it after.
import { readFileSync } from "node:fs";
import { reconstructionProse, setStatementHtml, headerFragment, sheetHeaderFragment } from "../../src/app/statement";

const offsets = { file: "RG164.CRIS.FY94.txt", sha256: "abcdef0123456789", records: [] };
// Threaded in as a parameter, not a hard-coded "/registry/..." path.
const registryUrl = "/assets/evidence-test1234.json";

test("a checked hash-full-toggle survives a rewrite of the same container", () => {
  const container = document.createElement("div");
  container.innerHTML = reconstructionProse(offsets, registryUrl);
  const toggle = container.querySelector<HTMLInputElement>("#hash-full-toggle")!;
  expect(toggle.checked).toBe(false);
  toggle.checked = true;

  setStatementHtml(container, reconstructionProse(offsets, registryUrl));

  const toggleAfter = container.querySelector<HTMLInputElement>("#hash-full-toggle")!;
  expect(toggleAfter).not.toBeNull();
  expect(toggleAfter.checked).toBe(true);
});

test("an unchecked toggle stays unchecked across a rewrite", () => {
  const container = document.createElement("div");
  container.innerHTML = reconstructionProse(offsets, registryUrl);
  setStatementHtml(container, reconstructionProse(offsets, registryUrl));
  const toggle = container.querySelector<HTMLInputElement>("#hash-full-toggle")!;
  expect(toggle.checked).toBe(false);
});

test("a container with no prior toggle (first render) is unaffected", () => {
  const container = document.createElement("div");
  setStatementHtml(container, reconstructionProse(offsets, registryUrl));
  const toggle = container.querySelector<HTMLInputElement>("#hash-full-toggle")!;
  expect(toggle).not.toBeNull();
  expect(toggle.checked).toBe(false);
});

// The panel is the whole reconstruction statement now that the rules list is gone: the
// heading, the framing paragraph, the registry link, and the Integrity details.
test("the panel renders the heading, the NARA identifier, the registry link, and the Integrity details", () => {
  const container = document.createElement("div");
  setStatementHtml(container, reconstructionProse(offsets, registryUrl));
  expect(container.querySelector("h2")!.textContent).toBe("A reconstruction, not a recorded session");
  expect(container.textContent).toContain("National Archives Identifier 1204533");
  expect(container.querySelector(`a[href="${registryUrl}"]`)).not.toBeNull();
  const details = container.querySelector("details")!;
  expect(details.querySelector("summary")!.textContent).toBe("Integrity");
  expect(details.textContent).toContain(offsets.file);
  expect(details.textContent).toContain(offsets.sha256);
  expect(container.querySelectorAll("li")).toHaveLength(0);
});

// terminal.paper_sheet's header block: statement.ts's sheetHeaderFragment feeds the sheet's
// own header, set once inside #sheet in main.ts. It carries the same four integrity values
// as the panel's Integrity details, shown plainly, with no checkbox reveal.
test("the sheet header shows the corpus SHA-256 and the registry hash", () => {
  const container = document.createElement("div");
  container.innerHTML = sheetHeaderFragment(offsets);
  expect(container.textContent).toContain(offsets.sha256);
  expect(container.textContent).toContain(__REGISTRY_HASH__);
  expect(container.querySelector("#hash-full-toggle")).toBeNull();
});

// headerFragment is the one export reconstructionProse and sheetHeaderFragment both build
// on, so the heading and framing paragraph read identically in the panel and on the sheet.
test("the panel and the sheet header render the same heading and statement paragraph", () => {
  const panel = document.createElement("div");
  panel.innerHTML = reconstructionProse(offsets, registryUrl);
  const sheet = document.createElement("div");
  sheet.innerHTML = sheetHeaderFragment(offsets);
  expect(sheet.querySelector("h2")!.textContent).toBe(panel.querySelector("h2")!.textContent);
  expect(sheet.querySelector("p")!.textContent).toBe(panel.querySelector("p")!.textContent);
  expect(sheetHeaderFragment(offsets)).toContain(headerFragment());
});

// The sheet header lives inside #sheet in every mode (statement.ts builds no DOM of its own,
// so its visibility is CSS's job); index.html hides it by default and shows it only in paper
// mode and under @media print.
test("index.html shows #sheet-header only in paper mode and under @media print", () => {
  const html = readFileSync("index.html", "utf8");
  expect(html).toMatch(/#sheet-header\{display:none\}/);
  expect(html).toMatch(/:root\.paper #sheet-header\{display:block/);
  const printBlock = html.match(/@media print\{([\s\S]*?)\n  \}\n/)?.[1] ?? "";
  expect(printBlock).toMatch(/#sheet-header\{display:block/);
});
