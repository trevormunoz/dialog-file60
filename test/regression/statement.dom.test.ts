// @vitest-environment happy-dom
//
// src/app/main.ts's refresh() rewrites the statement panel's innerHTML on restart and on a
// display-mode change, so a reader's SHA-256 "show full" reveal would
// silently collapse -- the checkbox in the fresh markup is unchecked by construction.
// setStatementHtml is the fix: it reads the checkbox's checked state before the rewrite and
// restores it after.
import { reconstructionProse, setStatementHtml } from "../../src/app/statement";

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
