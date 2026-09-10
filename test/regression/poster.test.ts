import { readFileSync } from "node:fs";
import { posterFrom } from "../../scripts/poster";

// The BARC story site's page plays the recording in a self-hosted
// asciinema player and shows this transcript inside that player's <noscript>, so the page
// reads with JavaScript off. posterFrom turns the asciicast's output events back into plain
// lines; the pacing, which is the recording's point, belongs to the player, not to a <pre>.
const cast = readFileSync("casts/first-session.cast", "utf8");

test("the poster is plain text with no escape sequences and no timing", () => {
  const poster = posterFrom(cast);
  expect(poster).not.toMatch(/\x1b/);
  expect(poster).not.toMatch(/\[\s*[\d.]+\s*,\s*"o"/);
  expect(poster).not.toMatch(/\r/);
});

test("the poster carries the reconstruction statement's first line", () => {
  expect(posterFrom(cast)).toContain("RECONSTRUCTION, NOT A RECORDED SESSION");
});

test("the poster shows the session's first command at the prompt", () => {
  expect(posterFrom(cast)).toMatch(/\?b 60/); // the cast echoes the command as typed, lower case
});

test("the poster is capped at the cast's own height by default", () => {
  expect(posterFrom(cast).split("\n").length).toBeLessThanOrEqual(24);
  expect(posterFrom(cast, 6).split("\n").length).toBe(6);
});

test("the committed poster file is what posterFrom produces from the committed cast", () => {
  expect(readFileSync("casts/first-session.poster.txt", "utf8")).toBe(posterFrom(cast) + "\n");
});

test("no colour, medium or CRT language is introduced", () => {
  expect(posterFrom(cast)).not.toMatch(/scanline|phosphor|crt|green-?bar|perforat/i);
});
