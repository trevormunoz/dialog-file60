import { readFileSync } from "node:fs";
import { buildCast } from "../../src/cast/asciicast";
import { registry } from "../../src/registry";

// The cast header's width reads registry terminal.width rather than a hardcoded 80, so the
// 80-column measure LineDiscipline and index.html's CSS also carry has one source rather
// than three unlinked enactments. Source-text check, not just a value comparison
// (which would pass by coincidence as long as the registry also says 80): the cast header's
// width must actually be read from the registry.
test("the cast header's width is read from registry terminal.width, not a hardcoded literal", () => {
  const src = readFileSync("src/cast/asciicast.ts", "utf8");
  expect(src).not.toMatch(/width:\s*80\b/);
  expect(src).toMatch(/registry\.get\("terminal\.width"\)/);
});

// buildCast produces an asciicast v2 recording from a flat, already-ordered line stream
// (the reconstruction statement's lines first, then per-command prompt+command and
// output). This test feeds a fixed three-line session -- a statement heading, a typed
// command, and one line of that command's output -- and checks the header, the pacing
// arithmetic against the registry's cast.pacing value, and that no text is lost or
// duplicated in the event stream.
describe("buildCast", () => {
  const pacing = registry.get("cast.pacing").value as { cps: number; typeCps: number; pauseAfterCommand: number };
  const STATEMENT_HEADING = "--- RECONSTRUCTION, NOT A HISTORICAL RECORD ---";
  const TYPED = "?s cy=beltsville";
  const OUTPUT = "      S1     669  CY=BELTSVILLE";
  const lines = [STATEMENT_HEADING, TYPED, OUTPUT];
  const header = { statement: "x", corpusSha256: "abc", softwareVersion: "0.0.0", registryHash: "abc123def456", pacingStatus: "chosen for this reconstruction" };
  const cast = buildCast(lines, { cps: pacing.cps, typeCps: pacing.typeCps, pauseAfterCommand: pacing.pauseAfterCommand, title: "test cast", header });
  const [headerLine, ...eventLines] = cast.trim().split("\n");
  const parsedHeader = JSON.parse(headerLine!);
  const events = eventLines.map((l) => JSON.parse(l)) as [number, "o", string][];

  // Asserted against registry.get("terminal.width").value, not the
  // literal 80, so this and the two other 80-column enactments (LineDiscipline's default,
  // index.html's CSS) cannot silently drift apart from the registry.
  test("the header carries the asciicast v2 fields, a neutral theme, and x-reconstruction", () => {
    expect(parsedHeader.version).toBe(2);
    expect(parsedHeader.width).toBe(registry.get("terminal.width").value);
    expect(parsedHeader.height).toBe(24);
    expect(parsedHeader.env).toEqual({});
    expect(parsedHeader.title).toBe("test cast");
    expect(parsedHeader.theme).toEqual({ fg: "#111111", bg: "#ffffff" });
    expect(parsedHeader["x-reconstruction"]).toEqual(header);
  });

  test("no CRT, scanline, phosphor, sound, or colour claim anywhere in the header or title", () => {
    const text = JSON.stringify(parsedHeader).toLowerCase();
    expect(text).not.toMatch(/scanline|phosphor|crt|green-?bar|sound/);
  });

  test("the first event text is the statement's heading line", () => {
    expect(events[0]![2]).toBe(STATEMENT_HEADING);
  });

  test("event count matches the input line count, and every event is an \"o\" event", () => {
    expect(events.length).toBe(lines.length);
    for (const e of events) expect(e[1]).toBe("o");
  });

  test("times are non-decreasing and computed from the registry pacing", () => {
    const times = events.map((e) => e[0]);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    // line 0 (statement) at cps; line 1 (typed, prompt-prefixed) at typeCps.
    const expectedAtLine1 = STATEMENT_HEADING.length / pacing.cps + TYPED.length / pacing.typeCps;
    expect(times[1]).toBeCloseTo(expectedAtLine1, 3);
    // line 2 (output) follows the pause after the typed command.
    const expectedAtLine2 = expectedAtLine1 + pacing.pauseAfterCommand + OUTPUT.length / pacing.cps;
    expect(times[2]).toBeCloseTo(expectedAtLine2, 3);
  });

  test("the text of all events concatenated equals the input lines joined with \\r\\n", () => {
    const concatenated = events.map((e) => e[2]).join("");
    expect(concatenated).toBe(lines.join("\r\n"));
  });

  test("accepts OutputLine[] as well as string[]", () => {
    const out = buildCast(
      [{ text: STATEMENT_HEADING }, { text: TYPED }, { text: OUTPUT, provenance: { registryKeys: ["render.record.order"] } }],
      { cps: pacing.cps, typeCps: pacing.typeCps, pauseAfterCommand: pacing.pauseAfterCommand, title: "test cast", header },
    );
    const outEvents = out.trim().split("\n").slice(1).map((l) => JSON.parse(l)) as [number, "o", string][];
    expect(outEvents.map((e) => e[2]).join("")).toBe(lines.join("\r\n"));
  });
});
