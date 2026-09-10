import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildIndexes } from "../src/loader/index-builder";
import { PHRASE_FIELDS, type Offsets, type Index } from "../src/loader/corpus-format";
import { RetrievalEngine } from "../src/retrieval/engine";
import { FsWordIndex } from "../src/retrieval/words-node";
import { FsRangeReader } from "../src/retrieval/reader-node";
import { DialogSession } from "../src/dialog/session";
import { renderFor } from "../src/dialog/render5";
import type { OutputLine } from "../src/dialog/stream";
import { buildCast } from "../src/cast/asciicast";
import { registry } from "../src/registry";
import { statusWords } from "../src/registry/words";
import { appDefine } from "../config/define";

// __APP_VERSION__/__REGISTRY_HASH__ (src/app/env.d.ts) are ordinarily substituted by Vite's
// or Vitest's esbuild `define` (config/define.ts) at transform time -- that substitution
// does not run for a plain `tsx` invocation (`pnpm cast`), so castStatement's bare references
// to them would throw ReferenceError without this. Reading appDefine's own
// JSON-stringified values keeps this in lockstep with the bundled app rather than
// recomputing the hash a second way. Harmless under Vitest: there, esbuild has already
// replaced the bare identifiers with literals before this file's own code runs, and these
// lines only ever write to global *properties*, never to the bare identifiers themselves.
(globalThis as Record<string, unknown>).__APP_VERSION__ = JSON.parse(appDefine.__APP_VERSION__);
(globalThis as Record<string, unknown>).__REGISTRY_HASH__ = JSON.parse(appDefine.__REGISTRY_HASH__);

const FILE = "RG164.CRIS.FY94.txt";
const COMMANDS = [
  "b 60",
  "e in=hammerschlag",
  "ss cy=beltsville or cy=greenbelt",
  "s s3 and in=hammerschlag  f a",
  "ds",
  "t s4/5/1",
  "logoff",
];

// A deterministic clock, not the real one -- the recording is reproducible byte for byte
// across runs, so its stamp and LOGOFF connect-time lines cannot drift with wall-clock time
// the way BEGIN's stamp would with `new Date()`. It advances a fixed 12 seconds on every call
// (session construction, BEGIN's stamp, LOGOFF's end) rather than returning one frozen
// instant, so LOGOFF's connect-time line shows a nonzero span and BEGIN and LOGOFF print
// different stamps -- the times are chosen for the recording, not measured from a real
// session.
let castClockCalls = 0;
const CAST_CLOCK = {
  now: () => new Date(Date.UTC(1994, 4, 3, 10, 0, 0) + 12_000 * castClockCalls++),
};

/** Loads offsets and phrase indexes the same way the app does (fetch, in main.ts) or the
 * loader CLI does (build, in src/loader/cli.ts): prefer the already-built public/corpus
 * files if present, and only run the (slower) full-corpus build from data/ when they are
 * not. Either way the
 * corpus bytes themselves are read from whichever copy is actually on disk; data/ is
 * gitignored (never committed), public/corpus/ is gitignored too (Vite's local static copy). */
function loadEngine(): { engine: RetrievalEngine; offsets: Offsets } {
  let offsets: Offsets;
  let indexes: Record<string, Index>;
  let corpusPath: string;
  if (existsSync("public/corpus/offsets.json")) {
    offsets = JSON.parse(readFileSync("public/corpus/offsets.json", "utf8"));
    indexes = {};
    for (const code of PHRASE_FIELDS) indexes[code] = JSON.parse(readFileSync(`public/corpus/index/${code}.json`, "utf8"));
    corpusPath = existsSync(`public/corpus/${offsets.file}`) ? `public/corpus/${offsets.file}` : `data/${offsets.file}`;
  } else {
    const bytes = new Uint8Array(readFileSync(`data/${FILE}`));
    const built = buildIndexes(bytes, FILE);
    offsets = built.offsets;
    indexes = built.indexes;
    corpusPath = `data/${FILE}`;
  }
  const engine = new RetrievalEngine(offsets, indexes, new FsRangeReader(corpusPath), "fy1991plus", new FsWordIndex("public/corpus"));
  return { engine, offsets };
}

/**
 * The plain-text statement the recording opens with, and repeats in the header's
 * x-reconstruction object. Written here rather than shared with src/app/statement.ts, whose
 * output is HTML for the on-screen panel.
 *
 * The block carries no list of the undocumented rules in effect: every behaviour cites its
 * registry key at its point of use, and registry/evidence.json is the one place the full
 * list lives.
 */
function castStatement(offsets: Offsets): string {
  return [
    "--- RECONSTRUCTION, NOT A RECORDED SESSION ---",
    "DIALOG File 60 rules, anchored c. 1990-1994, applied to the FY 1994 Format B export held by NARA.",
    `corpus ${offsets.file} sha256 ${offsets.sha256}`,
    `software dialog-file60 ${__APP_VERSION__}; registry ${__REGISTRY_HASH__}`,
    "---",
  ].join("\n");
}

/**
 * Runs an extended research session -- the acceptance session's CY=BELTSVILLE/IN=HAMMERSCHLAG
 * question (fixtures/ACCEPTANCE.md) plus EXPAND, an OR across SELECT STEPS, DISPLAY SETS, and
 * LOGOFF -- through the same RetrievalEngine and DialogSession wiring as src/app/main.ts, and
 * builds the asciicast recording from its output. Exported so test/archival/cast-session.test.ts can run it in-process rather than
 * shelling out to a subprocess from inside a Vitest test; the module's own bottom guard is the
 * `pnpm cast` entry point.
 */
export async function buildFirstSessionCast(): Promise<{ cast: string; offsets: Offsets }> {
  const { engine, offsets } = loadEngine();
  const session = new DialogSession(engine, renderFor, { clock: CAST_CLOCK });
  const prompt = (registry.get("proto.prompt").value as string) + (registry.get("proto.prompt.spacing").value as string);

  const sessionLines: OutputLine[] = [];
  for (const cmd of COMMANDS) {
    sessionLines.push({ text: prompt + cmd });
    sessionLines.push(...(await session.submit(cmd)));
  }

  const statement = castStatement(offsets);
  const statementLines: OutputLine[] = statement.split("\n").map((text) => ({ text }));

  const pacingEntry = registry.get("cast.pacing");
  const pacing = pacingEntry.value as { cps: number; typeCps: number; pauseAfterCommand: number };

  const cast = buildCast([...statementLines, ...sessionLines], {
    cps: pacing.cps,
    typeCps: pacing.typeCps,
    pauseAfterCommand: pacing.pauseAfterCommand,
    title: "DIALOG File 60 -- first research session (reconstruction)",
    header: {
      statement,
      corpusSha256: offsets.sha256,
      softwareVersion: __APP_VERSION__,
      registryHash: __REGISTRY_HASH__,
      pacingStatus: statusWords(pacingEntry.status),
    },
  });
  return { cast, offsets };
}

if (process.argv[1]?.endsWith("cast.ts")) {
  const { cast } = await buildFirstSessionCast();
  mkdirSync("casts", { recursive: true });
  writeFileSync("casts/first-session.cast", cast);
  const lineCount = cast.trim().split("\n").length;
  console.log(`wrote casts/first-session.cast: ${cast.length} bytes, ${lineCount} lines (1 header + ${lineCount - 1} events)`);
}
