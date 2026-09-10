// @vitest-environment happy-dom
//
// Environment: happy-dom, declared per-file above rather than via vitest.config.ts's
// (deprecated) environmentMatchGlobs.
//
// This file covers mountInspect (src/inspect/panel.ts). It mounts it with a
// stub engine -- a minimal object satisfying the one method mountInspect calls
// (engine.record), not a real RetrievalEngine over corpus indexes -- and a stub SourceFile,
// so this file stays a DOM/wiring test rather than a retrieval test.
import { mountInspect, type SourceFile } from "../../src/inspect/panel";
import { registry } from "../../src/registry";
import type { RetrievalEngine } from "../../src/retrieval/engine";
import type { LogicalRecord } from "@barcstory/cris-formatb";

// A 200-character unbroken value (no spaces for pre-wrap alone to break
// on) -- the DOM test below asserts the bytes-line <pre> is styled to wrap it anyway.
const LONG_RAW = "X".repeat(200);

const stubRecord: LogicalRecord = {
  file: "RG164.CRIS.FY94.txt", firstLine: 83052, lastLine: 83173, offset: 6810182, length: 10004, an: "9049442",
  orphanContinuations: 0,
  fields: [
    { tag: "IN", values: [{ raw: "HAMMERSCHLAG  F A", line: 83060, offset: (83060 - 1) * 82 }], lineStart: 83060, lineEnd: 83060, offset: (83060 - 1) * 82, length: 82 },
    { tag: "TI", values: [{ raw: "SOIL EROSION STUDY", line: 83061, offset: (83061 - 1) * 82 }], lineStart: 83061, lineEnd: 83061, offset: (83061 - 1) * 82, length: 82 },
    { tag: "AB", values: [{ raw: LONG_RAW, line: 83070, offset: (83070 - 1) * 82 }], lineStart: 83070, lineEnd: 83070, offset: (83070 - 1) * 82, length: 82 },
    {
      tag: "SC",
      values: [
        { raw: "S1015", code: "S1015", line: 83080, offset: (83080 - 1) * 82 },
        { raw: "S2610", code: "S2610", line: 83081, offset: (83081 - 1) * 82, continuation: true },
      ],
      lineStart: 83080, lineEnd: 83081, offset: (83080 - 1) * 82, length: 164,
    },
  ],
};
const engine = { record: async (_ordinal: number) => stubRecord } as unknown as RetrievalEngine;
const source: SourceFile = { file: "RG164.CRIS.FY94.txt", naid: "1204533", profile: "fy1991plus", sha256: "deadbeef" };

function stampedSpan(ordinal: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.dataset.ordinal = ordinal; span.dataset.tags = "IN"; span.dataset.keys = "map.IN";
  span.tabIndex = 0; // src/terminal/sink.ts sets this on every stamped span; set by hand here
  span.textContent = "      IN   HAMMERSCHLAG  F A\n";
  return span;
}

/** A span stamped for the TI tag (a suffix code, /TI) instead of IN (a prefix code, IN=) --
 * the suffix-code case. */
function stampedTitleSpan(ordinal: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.dataset.ordinal = ordinal; span.dataset.tags = "TI"; span.dataset.keys = "map.TI";
  span.tabIndex = 0;
  span.textContent = "  SOIL EROSION STUDY\n";
  return span;
}

// mountInspect attaches one document-level keydown listener per call (Alt+I and Escape must
// work regardless of which pane has focus); each test that mounts it must dispose that
// listener afterward so it stops observing later tests' key events.
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(d => d()); document.body.replaceChildren(); });

// The inspect panel's five cards, worded for a reader who does not know the registry.
// "CRIS source (Format B)" and "Archival source" are merged into one ("The bytes in the
// NARA file": tag and raw value, then where in the file it sits).
const FIVE_TITLES = [
  "What was printed", "How DIALOG names it", "The bytes in the NARA file",
  "Where the file came from", "Why it prints this way",
];

// registry/evidence.json's inspect.mode.value can drift from the card names the panel
// actually renders, with nothing to catch it. This pins the live registry value against the
// titles this file already asserts the panel renders.
test("inspect.mode's registry value names the five cards the panel actually renders", () => {
  const value = registry.get("inspect.mode").value as string;
  for (const title of FIVE_TITLES) expect(value).toContain(title);
});

test("clicking a stamped span opens all five inspect sections", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  // Each h3's first child is its title text node; a status pill, when present, is a
  // second, appended child -- read only the first so a pill's own text doesn't fold in.
  const titles = [...root.querySelectorAll("h3")].map(h => h.childNodes[0]?.textContent);
  expect(titles).toEqual(FIVE_TITLES);
});

// Every card carries a one-line lead-in beneath its title; "What was printed" and "Where the
// file came from" are the two that once lacked one.
test("\"What was printed\" and \"Where the file came from\" each render a one-line lead-in", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const cardFor = (title: string) => [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === title)!;
  expect(cardFor("What was printed").querySelector("p.lead")?.textContent).toMatch(/exactly as it appeared/);
  expect(cardFor("Where the file came from").querySelector("p.lead")?.textContent).toMatch(/how the bytes reached NARA/);
});

// Merging "CRIS source" and "Archival source" into "The bytes in the NARA file" can drop the
// record-level archival identification (NAID, line range, byte length, encoding profile) the
// separate "Archival source" card used to carry, with nothing rendering it. This pins the
// NAID, the record's line range, and its byte length so they cannot silently disappear.
test("\"The bytes in the NARA file\" names the NAID, the record's line range, and its byte length", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "The bytes in the NARA file")!;
  const text = card.textContent ?? "";
  expect(text).toContain("National Archives Identifier 1204533");
  expect(text).toContain("line 83,052 to line 83,173");
  expect(text).toContain("10,004 bytes");
});

// A prefix code (IN=, ends "=") and its value print with no separator, the form "DS=1275"
// takes, and a suffix code (/TI, starts "/") prints with one space before its value. Both
// once printed "CODE: value", doubling the punctuation for a prefix code
// ("IN=: HAMMERSCHLAG...").
test("\"How DIALOG names it\" prints a prefix code with no separator and a suffix code with one space", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const prefixSpan = stampedSpan("0");
  const suffixSpan = stampedTitleSpan("0");
  printout.append(prefixSpan, suffixSpan);
  disposers.push(mountInspect(root, printout, engine, source));

  const cardText = async (span: HTMLElement) => {
    span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    return [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "How DIALOG names it")!.textContent ?? "";
  };

  expect(await cardText(prefixSpan)).toContain("IN=HAMMERSCHLAG  F A");
  expect(await cardText(prefixSpan)).not.toContain("IN=: ");
  expect(await cardText(suffixSpan)).toContain("/TI SOIL EROSION STUDY");
  expect(await cardText(suffixSpan)).not.toContain("/TI: ");
});

// A line with no DIALOG search/display code (a literal structural
// line like the copyright banner, stamped with data-keys but no data-tags) used to render
// "How DIALOG names it" anyway -- a lead sentence promising a code with nothing under it.
test("\"How DIALOG names it\" is omitted for a literal line with no DIALOG field code", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = document.createElement("span");
  span.dataset.ordinal = "0"; span.dataset.keys = "render.format5.layout"; span.tabIndex = 0;
  span.textContent = " (c) format only 1998 The Dialog Corporation plc\n";
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const titles = [...root.querySelectorAll("h3")].map(h => h.childNodes[0]?.textContent);
  expect(titles).not.toContain("How DIALOG names it");
  expect(titles).toEqual(["What was printed", "The bytes in the NARA file", "Where the file came from", "Why it prints this way"]);
});

// The card's trailing sentence also names the corpus's own fixity hash, read from the
// SourceFile main.ts passes in rather than from an unused `offsets` parameter.
test("\"The bytes in the NARA file\" ends with the encoding profile and the corpus SHA-256", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "The bytes in the NARA file")!;
  const text = card.textContent ?? "";
  expect(text).toContain("FY 1991-and-later encoding profile");
  expect(text).toContain("deadbeef");
});

// The ring and the chip appear together and disappear together -- neither is ever left
// behind when inspect moves to a different span.
test("the inspected ring and the chip move together, never leaving one behind", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span1 = stampedSpan("0");
  const span2 = stampedSpan("0");
  printout.append(span1, span2);
  disposers.push(mountInspect(root, printout, engine, source));

  expect(printout.querySelectorAll(".inspected").length).toBe(0);
  expect(printout.querySelectorAll(".chip").length).toBe(0);

  span1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(span1.classList.contains("inspected")).toBe(true);
  expect(printout.querySelectorAll(".inspected").length).toBe(1);
  expect(printout.querySelectorAll(".chip").length).toBe(1);

  span2.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(span1.classList.contains("inspected")).toBe(false);
  expect(span2.classList.contains("inspected")).toBe(true);
  expect(printout.querySelectorAll(".inspected").length).toBe(1);
  expect(printout.querySelectorAll(".chip").length).toBe(1);
});

// Keyboard-only operation.
test("Enter on a focused stamped span opens inspect exactly as a click does", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  document.body.append(root, printout); // focus() only takes effect on a connected element
  disposers.push(mountInspect(root, printout, engine, source));

  span.focus();
  span.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(root.querySelectorAll("h3").length).toBe(5);
  expect(span.classList.contains("inspected")).toBe(true);
});

test("Space on a focused stamped span opens inspect exactly as a click does", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  document.body.append(root, printout);
  disposers.push(mountInspect(root, printout, engine, source));

  span.focus();
  span.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(root.querySelectorAll("h3").length).toBe(5);
});

test("Escape while focus is on a stamped span returns focus to the prompt", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  document.body.append(root, printout);
  let focusedPrompt = 0;
  disposers.push(mountInspect(root, printout, engine, source, () => { focusedPrompt++; }));

  span.focus();
  span.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(document.activeElement).toBe(span); // opening inspect does not steal focus

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(focusedPrompt).toBe(1);
});

test("Alt+I inspects the most recently typed record line regardless of where focus is", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span1 = stampedSpan("0");
  const span2 = stampedSpan("0");
  printout.append(span1, span2);
  document.body.append(root, printout);
  disposers.push(mountInspect(root, printout, engine, source));

  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "i", altKey: true, bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(root.querySelectorAll("h3").length).toBe(5);
  expect(span2.classList.contains("inspected")).toBe(true);
  expect(span1.classList.contains("inspected")).toBe(false);
});

// Without the three tests below, nothing covers the inspect card content -- claims,
// sourceName citations, thousands separators, the footer sentence -- so a regression to raw
// citation keys, unformatted offsets, or an older footer would still pass.
test("\"Why it prints this way\" cites claims and reader citations, not registry citation keys", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "Why it prints this way")!;
  const text = card.textContent ?? "";
  const claim = registry.get("map.IN").claim;
  expect(text).toContain(claim);
  expect(text).toMatch(/Sources:/);
  // No raw citation key from the registry reaches the panel: a reader sees the citation
  // sourceName builds, never the key the registry joins on.
  for (const k of registry.keys()) {
    for (const s of registry.get(k).sources ?? []) {
      expect(text, `raw source key "${s.source}" leaked into the panel`).not.toContain(s.source);
    }
  }
});

test("\"The bytes in the NARA file\" renders each source value's line number with a thousands separator", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "The bytes in the NARA file")!;
  expect(card.textContent).toMatch(/line 83,060, byte/);
});

test("the panel footer reads the reconstruction-apparatus sentence", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(root.textContent).toContain("Inspect is modern apparatus added by the reconstruction; it does not change the session.");
});

// The first citation of a source kind on "Why it prints this way" carries
// its gloss in a muted line beneath it; a later citation of the same kind on the same card
// does not repeat it. A stamped IN span's evidence includes the FY1994_TAPE keys
// (nara.conversion.line_form, nara.conversion.control_bytes, nara.tape.fy1994_media), whose
// sources between them cite the NARA validation statement (both its PDF forms) three times
// over -- a real multi-citation case, not a contrived one -- so the gloss must appear once.
test("\"Why it prints this way\" shows a repeated source-kind's gloss once, on its first citation", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "Why it prints this way")!;
  const text = card.textContent ?? "";
  // nara.conversion.control_bytes and nara.tape.fy1994_media both
  // cite nara-cris-packet (the NARA documentation packet), which is a genuine repeat
  // of one gloss across two entries -- the case the dedup logic exists for.
  const gloss = "A NARA packet: the FY 1988 and FY 1991 validation statements and the Format B field table, bound together.";
  expect(text).toContain(gloss);
  expect(text.split(gloss).length - 1).toBe(1);
});

// happy-dom lays out everything at zero size, so scrollWidth/clientWidth
// cannot show a real overflow -- the computed white-space and overflow-wrap on the bytes-line
// <pre> are what a real browser honours, so those are what this test checks, on a value long
// enough (200 characters, no spaces) that pre-wrap alone could not break it.
test("a long unbroken raw value renders in a <pre> styled to wrap instead of scroll", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = document.createElement("span");
  span.dataset.ordinal = "0"; span.dataset.tags = "AB"; span.dataset.keys = "map.IN"; span.tabIndex = 0;
  span.textContent = "long field\n";
  printout.appendChild(span);
  document.body.append(root, printout); // getComputedStyle only reflects a connected element
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "The bytes in the NARA file")!;
  const bytesPre = [...card.querySelectorAll("pre")].find(p => p.textContent?.includes(LONG_RAW))!;
  expect(bytesPre).toBeTruthy();
  const style = getComputedStyle(bytesPre);
  expect(style.whiteSpace).toBe("pre-wrap");
  expect(style.overflowWrap).toBe("anywhere");
});

// Opening inspect expands the aside if it is collapsed. panel.ts
// does not know about the aside's own collapsed state or DOM structure -- it calls an
// optional onExpand callback at every entry point (click, Enter/Space, Alt+I) and leaves
// expanding to the caller (src/app/main.ts). Clicking a second stamped span while the panel
// is already open calls onExpand again (harmless -- src/app/main.ts's expand is idempotent)
// and replaces the card content, without this module ever touching collapse state itself.
test("opening inspect calls onExpand, on a click and on Alt+I, without touching collapse state itself", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span1 = stampedSpan("0");
  const span2 = stampedSpan("0");
  printout.append(span1, span2);
  document.body.append(root, printout);
  let expandCount = 0;
  disposers.push(mountInspect(root, printout, engine, source, undefined, () => { expandCount++; }));

  span1.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(expandCount).toBe(1);

  span2.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(expandCount).toBe(2); // replaces the content; onExpand is called again, harmlessly

  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "i", altKey: true, bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(expandCount).toBe(3);
});

// record.ts drops the 0xAC byte itself from the value's text before the panel ever sees it
// (phraseKey and the index must never see it); the panel needs a separate signal to know a
// value was opened by one, so it can still show the reader the byte the file actually holds.
test("the bytes card shows the continuation byte on a value that a 0xAC opened", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = document.createElement("span");
  span.dataset.ordinal = "0"; span.dataset.tags = "SC"; span.dataset.keys = "map.IN"; span.dataset.valueIndex = "1";
  span.tabIndex = 0;
  span.textContent = "  S2610\n";
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const card = [...root.querySelectorAll(".card")].find(c => c.querySelector("h3")?.childNodes[0]?.textContent === "The bytes in the NARA file")!;
  expect(card.textContent).toContain("[AC]");
});

test("mountInspect works with no onExpand callback given", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.appendChild(span);
  disposers.push(mountInspect(root, printout, engine, source));

  span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(root.querySelectorAll("h3").length).toBe(5);
});

// A real macOS keyboard sends this shape for Option+I: Option is a dead-key modifier on
// US layout, so it composes the circumflex accent rather than "i" -- ke.key comes back
// "Dead", never "i". ke.code stays "KeyI" regardless. The synthetic { key: "i" } shape in
// the test above never occurs on this app's only platform; this test is the one that
// proves the chord fires there.
test("Alt+I fires on the real macOS Option+I event shape (key: Dead, code: KeyI)", async () => {
  const root = document.createElement("div");
  const printout = document.createElement("pre");
  const span = stampedSpan("0");
  printout.append(span);
  document.body.append(root, printout);
  disposers.push(mountInspect(root, printout, engine, source));

  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Dead", code: "KeyI", altKey: true, bubbles: true, cancelable: true }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  expect(root.querySelectorAll("h3").length).toBe(5);
  expect(span.classList.contains("inspected")).toBe(true);
});
