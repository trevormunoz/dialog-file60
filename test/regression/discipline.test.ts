import { LineDiscipline } from "../../src/terminal/discipline";
import { registry } from "../../src/registry";

// The textarea's native editing is the input model. LineDiscipline is
// the output wrapper only -- no key(), no current, no editing state.
test("LineDiscipline carries no editing state or key handling", () => {
  const d = new LineDiscipline();
  expect((d as unknown as Record<string, unknown>).current).toBeUndefined();
  expect((d as unknown as Record<string, unknown>).key).toBeUndefined();
});

// Every other test in this file constructs LineDiscipline with an
// explicit width parameter (80 or 10), so registry terminal.wrap's own width value is never
// actually exercised -- a test that injects 80 passes identically whether the registry says
// 80 or something else. This constructs with no argument (the registry-driven default) and
// checks it against registry.get("terminal.wrap").value.width directly, and pins that value
// at 80 so the three unlinked 80-column enactments (this one, index.html's CSS, and the
// asciicast width) cannot silently drift apart.
test("with no width given, LineDiscipline wraps at registry terminal.wrap's own width", () => {
  const registryWidth = (registry.get("terminal.wrap").value as { width: number }).width;
  expect(registryWidth).toBe(80);
  const d = new LineDiscipline();
  d.write("X".repeat(registryWidth + 10));
  expect(d.lines[0]!.length).toBe(registryWidth);
});

test("output wraps at 80 with a hanging indent to the description column", () => {
  const d = new LineDiscipline(80);
  d.write("      S1        1  " + "X".repeat(90));
  expect(d.lines.length).toBe(2);
  expect(d.lines[0]!.length).toBe(80);
  expect(d.lines[1]!.startsWith(" ".repeat(18))).toBe(true);
});

// The width guard clamps the hanging indent to width - 1. Without it, a
// narrower width than the registry's hangingIndent (18) would never make progress: each
// wrapped remainder would still exceed the width and write() would loop forever.
test("the hanging indent is clamped to width - 1 so wrapping always makes progress", () => {
  const d = new LineDiscipline(10);
  d.write("X".repeat(25));
  expect(d.lines[0]!.length).toBe(10);
  expect(d.lines[1]!.startsWith(" ".repeat(9))).toBe(true);
  expect(d.lines[1]!.startsWith(" ".repeat(10))).toBe(false);
  expect(d.lines.length).toBeGreaterThan(1);
});

