/**
 * Turns a casts/<name>.cast recording back into a plain-text transcript.
 *
 * The BARC story site plays each cast in a self-hosted asciinema player and shows this
 * transcript inside that player's <noscript>, so the page reads with JavaScript off. The
 * transcript is the recording's output events joined in order, with carriage returns and
 * escape sequences removed and no timing; the pacing, which is the recording's point, belongs
 * to the player. scripts/build-for-site.sh copies the poster transcript into the site (as of
 * this file, still wired to the single casts/first-session.poster.txt -- updating it for both
 * clips is Task 4's job, not this script's).
 */
import { readFileSync, writeFileSync } from "node:fs";

const ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/** The printable output of an asciicast v2 recording: one line per printed line, no timing, no
 * escape sequences, capped at `lines` (default: the cast header's own height). */
export function posterFrom(cast: string, lines?: number): string {
  const [headerLine, ...eventLines] = cast.split("\n");
  const header = JSON.parse(headerLine!) as { height?: number };
  const cap = lines ?? header.height ?? 24;
  let out = "";
  for (const line of eventLines) {
    if (!line.trim()) continue;
    const [, kind, text] = JSON.parse(line) as [number, string, string];
    if (kind === "o") out += text;
  }
  const rows = out.replace(ESCAPES, "").replace(/\r/g, "").split("\n");
  return rows.slice(0, cap).join("\n");
}

// Entry point for `pnpm poster`. Guarded so importing posterFrom from a test runs nothing.
if (process.argv[1] && /poster\.ts$/.test(process.argv[1])) {
  for (const name of ["friction", "poultry"]) {
    const cast = readFileSync(`casts/${name}.cast`, "utf8");
    writeFileSync(`casts/${name}.poster.txt`, posterFrom(cast) + "\n");
    console.log(`wrote casts/${name}.poster.txt`);
  }
}
