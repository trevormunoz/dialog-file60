import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import { registry } from "../../src/registry";
import type { Status } from "../../src/registry";

const html = readFileSync("index.html", "utf8");
const STATUSES: Status[] = ["documented", "inferred", "chosen"];

test("one theme: no dark-mode media query or theme attribute", () => {
  expect(html).not.toMatch(/prefers-color-scheme/);
  expect(html).not.toMatch(/data-theme/);
});

test("no external requests from the stylesheet", () => {
  expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
});

test("no visual archaeology", () => {
  expect(html).not.toMatch(/scanline|phosphor|crt|green-?bar|perforat/i);
});

test("a status pill class exists for every registry status", () => {
  for (const s of STATUSES) expect(html).toContain(`.pill-${s}`);
});

test("the prompt is a bare question mark", () => {
  expect(registry.get("proto.prompt").value).toBe("?");
  expect(registry.get("proto.prompt.spacing").value).toBe("");
  expect(registry.get("proto.prompt.spacing").status).toBe("documented");
});

test("sink appearance decisions are in the registry", () => {
  expect(registry.get("terminal.cursorForm").value).toBe("underline");
  expect(registry.get("terminal.backgroundColor").value).toBeNull();
  expect(registry.get("terminal.backgroundColor").status).toBe("chosen");
  expect(registry.get("terminal.textColor").status).toBe("chosen");
});

// No horizontal scrolling anywhere in the aside. The aside itself is the
// one place that needs both rules -- overflow-wrap is inherited, so declaring it once here
// reaches every descendant (the statement panel's dl/dd, every inspect card) without a
// separate rule per element.
test("the aside has no horizontal scroll and wraps long unbroken tokens", () => {
  const rule = html.match(/aside\{[^}]*\}/)?.[0] ?? "";
  expect(rule).toMatch(/overflow-x:\s*hidden/);
  expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  expect(rule).toMatch(/min-width:\s*0/);
});

test("a card can shrink instead of forcing its parent to scroll", () => {
  const rule = html.match(/\.card\{[^}]*\}/)?.[0] ?? "";
  expect(rule).toMatch(/min-width:\s*0/);
});

// A pre-existing rule, asserted explicitly here because the no-horizontal-scroll rule above
// depends on it for the bytes-line <pre> panel.ts renders each source value inside.
test("a card's <pre> wraps rather than running off the edge", () => {
  const rule = html.match(/\.card pre\{[^}]*\}/)?.[0] ?? "";
  expect(rule).toMatch(/white-space:\s*pre-wrap/);
});

// The aside collapses to a 28px rail on the right, carrying a toggle
// button and a vertical "Inspect" label; a plain width transition, disabled under
// prefers-reduced-motion.
test("the aside collapses to a rail via a width transition disabled under reduced motion", () => {
  expect(html).toMatch(/aside\.collapsed\{[^}]*width:\s*28px/);
  expect(html).toMatch(/aside\{[^}]*transition:\s*width/);
  expect(html).toMatch(/prefers-reduced-motion:\s*reduce\)\{aside\{transition:\s*none\}\}/);
});

test("the collapse toggle is wired for assistive tech", () => {
  expect(html).toMatch(/id="panel-toggle"/);
  expect(html).toMatch(/aria-controls="panel"/);
  expect(html).toMatch(/aria-expanded="(true|false)"/);
  expect(html).toMatch(/id="panel"/);
});

// The toggle is icon-only: its name comes from aria-label, never from the SVGs, which are
// inline (no icon font, no external request), aria-hidden and unfocusable. CSS shows one
// chevron per state, so both must be present in the markup.
test("the collapse toggle is an icon button with an accessible name and hidden SVGs", () => {
  const button = /<button[^>]*id="panel-toggle"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  expect(button).not.toBeNull();
  expect(button![0]).toMatch(/aria-label="(Hide|Show) inspect panel"/);
  const svgs = button![1]!.match(/<svg[^>]*>/g) ?? [];
  expect(svgs).toHaveLength(2);
  for (const tag of svgs) {
    expect(tag).toMatch(/aria-hidden="true"/);
    expect(tag).toMatch(/focusable="false"/);
  }
  expect(button![1]).not.toMatch(/<svg[^>]*(?:href|src)=/); // inline paths only
  expect(html).toMatch(/aside\.collapsed #panel-toggle \.icon-hide, aside:not\(\.collapsed\) #panel-toggle \.icon-show\{display:none\}/);
});

// The restart and display-mode key chords are documented next to Alt+I, the chord this
// pane label already named.
test("the pane label documents the restart and display-mode chords alongside Alt+I", () => {
  expect(html).toMatch(/Alt\+I/);
  expect(html).toMatch(/Alt\+R/);
  expect(html).toMatch(/Alt\+S/);
});

// The 80-column measure is enacted in three unlinked places
// (discipline.ts's LineDiscipline default, this CSS rule, and the asciicast width); this CSS
// rule is the enactment of registry terminal.width (sink.ts's registry.get("terminal.width")
// is a no-op citation since CSS cannot call it itself). Asserting the rule against the
// registry's own value, not the literal 80, means a changed terminal.width value would fail
// this test rather than silently leaving the stylesheet disagreeing with the registry.
test("the printout's max-width matches registry terminal.width", () => {
  const width = registry.get("terminal.width").value as number;
  const re = new RegExp(`\\.printout\\{[^}]*max-width:\\s*${width}ch`);
  expect(html).toMatch(re);
});

test("the SHA-256 reveal is gated in CSS both ways", () => {
  expect(html).toMatch(/\.hash-toggle:checked ~ \.hash-full\{display:inline\}/);
  expect(html).toMatch(/\.hash-toggle:checked ~ \.hash-short\{display:none\}/);
});

// The two `:checked` rules alone do not cover the unchecked default
// (.hash-full{display:none}) -- deleting that rule would show the 12-char prefix and the
// full hash side by side again with the suite still green.
test("the SHA-256 full hash is hidden by default", () => {
  expect(html).toMatch(/\.hash-full\{display:none\}/);
});

// terminal.width_rule (chosen): a one-pixel line at the printout's right edge
// marks the 80-column width of the documented terminals, and is dropped by a container query
// when the pane cannot show all 80 columns.
test("the printout carries a rule at its 80-column edge that a container query removes when narrow", () => {
  expect(registry.get("terminal.width_rule").status).toBe("chosen");
  expect(html).toMatch(/\.terminal-pane\{container-type:inline-size\}/);
  expect(html).toMatch(/\.printout\{[^}]*border-right:1px solid var\(--rule\)/);
  expect(html).toMatch(/@container \(max-width: 82ch\)\{\.printout\{border-right:0\}\}/);
});

// terminal.paper_sheet's two tokens: both neutral greys, defined at :root, no medium reading
// in either name or value.
test("paper mode's surround and sprocket tokens are neutral greys defined at :root", () => {
  const root = html.match(/:root\{[^}]*\}/)?.[0] ?? "";
  expect(root).toMatch(/--surround:\s*#[0-9a-f]{6}/i);
  expect(root).toMatch(/--sprocket:\s*#[0-9a-f]{6}/i);
});

// terminal.width (80) enacted a second time, inside :root.paper -- the sheet's own edges are
// the 80-column bounds there, not the .printout max-width rule the default layout uses.
test("the paper sheet's printout is bounded at 80ch, with the right-edge rule not drawn", () => {
  expect(html).toMatch(/:root\.paper \.printout\{[^}]*width:\s*80ch/);
  expect(html).toMatch(/:root\.paper \.printout\{[^}]*border-right:0/);
});

// terminal.paper_input_weight: the data-echo marker sink.ts stamps on an echoed command
// line's spans, weighted only on the sheet -- printout and screen mode's CSS never mentions it.
test("echoed input is weighted only under paper mode", () => {
  expect(html).toMatch(/:root\.paper \[data-echo\]\{font-weight:700\}/);
  expect(html.match(/\[data-echo\]/g)?.length).toBe(2); // the :root.paper rule and its @media print twin
});

// A browser print of the page, in any mode, is required to hide the same chrome paper mode
// hides and lay the sheet out the same way -- "the same rules apply," not a second design.
test("the print block hides the same chrome the paper block hides and lays out the same sheet", () => {
  const printBlock = html.match(/@media print\{([\s\S]*?)\n  \}\n/)?.[1] ?? "";
  expect(printBlock).not.toBe("");
  const hides = [
    "#bar > *:not(#display-mode){display:none}",
    "aside{display:none}",
    ".pane-label{display:none}",
    "#notice{display:none}",
  ];
  for (const rule of hides) {
    expect(html).toContain(`:root.paper ${rule}`);
    expect(printBlock).toContain(rule);
  }
  expect(html).toContain(":root.paper #bar{justify-content:center;background:transparent;color:var(--ink);border-bottom:0}");
  expect(printBlock).toContain("#bar{justify-content:center;background:transparent;color:var(--ink);border-bottom:0}");
  expect(html).toContain(":root.paper .promptline{width:80ch;max-width:100%}");
  expect(printBlock).toContain(".promptline{width:80ch}");
  expect(printBlock).toMatch(/#sheet\{width:calc\(80ch \+ 6\.5rem\)/);
  expect(printBlock).toMatch(/\.printout\{border-right:0;width:80ch\}/);
  // A printed page carries no display-mode control; the paper screen keeps it.
  expect(printBlock).toContain("#display-mode{display:none}");
  expect(html).not.toMatch(/:root\.paper #display-mode\{display:none\}/);
});
