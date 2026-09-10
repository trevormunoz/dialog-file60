#!/usr/bin/env -S node --import tsx
import { readFileSync } from "node:fs";
import { scanRecords, parseRecord, LINE_BYTES, PROFILE_NAMES, type Profile } from "./index";

const USAGE = "usage: cris-formatb scan <file> [--base-line <n>] | record <file> <firstLine> [--base-line <n>] [--profile fy1988|fy1991plus]";

/** Thrown by runCli for a usage or input error; carries the process exit code the shebang
 * block below should use, so the pure function never calls process.exit() itself. */
export class CliError extends Error {
  constructor(message: string, readonly exitCode: number) { super(message); }
}

/** Pulls --base-line and --profile out of the argument list, leaving the positional rest.
 * --base-line replaces an earlier 50 MB whole-file size heuristic. It
 * states the absolute line number of the given file's (or slice's) first byte -- 1 for the
 * whole corpus file, a record's own first line for a slice fixture that begins there -- so
 * every span's firstLine is always the corpus's own line number, never guessed from size. */
function parseFlags(args: string[]): { rest: string[]; baseLine: number; profile: string } {
  const rest: string[] = [];
  let baseLine = 1;
  let profile = "fy1991plus";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base-line") baseLine = Number(args[++i]);
    else if (args[i] === "--profile") profile = args[++i]!;
    else rest.push(args[i]!);
  }
  return { rest, baseLine, profile };
}

/**
 * The CLI's argv handling as a pure function, importable in-process from a test -- spawning
 * `npx tsx` from inside Vitest was the pattern this repository's own tests warn deadlocks a
 * parallel run. Returns the command's stdout text; throws CliError for a
 * usage or input error, carrying the exit code the shebang block below turns into process.exit().
 */
export function runCli(argv: string[]): string {
  const [cmd, file, ...restArgs] = argv;
  if (!cmd || !file) throw new CliError(USAGE, 2);
  const { rest, baseLine, profile } = parseFlags(restArgs);
  if (!(PROFILE_NAMES as readonly string[]).includes(profile)) {
    throw new CliError(`unknown --profile "${profile}" (expected ${PROFILE_NAMES.join(" or ")})`, 1);
  }
  const bytes = new Uint8Array(readFileSync(file));
  const { spans } = scanRecords(bytes, baseLine);
  if (cmd === "scan") {
    return spans.map(s => `${s.an}\t${s.firstLine}\t${s.lastLine}`).join("\n") + (spans.length ? "\n" : "");
  } else if (cmd === "record") {
    const firstLine = Number(rest[0] ?? baseLine);
    const span = spans.find(s => s.firstLine === firstLine);
    if (!span) throw new CliError(`no record starting at line ${firstLine} (--base-line ${baseLine})`, 1);
    const start = (span.firstLine - baseLine) * LINE_BYTES;
    const buf = bytes.subarray(start, start + span.length);
    // `profile` is echoed alongside the parsed record so a caller --
    // this CLI's own test included -- can see which encoding profile actually parsed it,
    // not just infer it from the flag it passed.
    return JSON.stringify({ profile, ...parseRecord(buf, span, file, profile as Profile) }, null, 1) + "\n";
  } else {
    throw new CliError(`unknown command ${cmd}`, 2);
  }
}

if (process.argv[1]?.endsWith("cli.ts")) {
  try {
    process.stdout.write(runCli(process.argv.slice(2)));
  } catch (e) {
    if (e instanceof CliError) { console.error(e.message); process.exit(e.exitCode); }
    throw e;
  }
}
