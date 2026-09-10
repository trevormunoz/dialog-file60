# Development

The file map, the acceptance session and its recording, and the checks a
change has to pass.

## File map

```
packages/cris-formatb/src/   the shared Format B reader (own package, @barcstory/cris-formatb)
  index.ts                     LINE_BYTES/DATA_START/DATA_END, the shared latin1() byte map, re-exports
  offsets.ts                   line <-> offset arithmetic, scanRecords (record boundary scan)
  record.ts                    LogicalRecord/SourceField/SourceValue types, parseRecord
  profiles.ts                  encoding profiles fy1988 / fy1991plus
  cli.ts                       runCli() (pure) + the `cris-formatb scan|record` entry point
registry/evidence.json       the evidence registry
src/registry/                index.ts: typed loader + get(); words.ts: reader-facing vocabulary
src/loader/                  corpus-format.ts: browser-safe types + PHRASE_FIELDS + indexUrls
                              corpus-urls.ts: every URL the browser fetches, derived from the build's base URL
                              index-builder.ts: buildIndexes (Node-only, node:crypto)
                              fixity.ts: checkFixity (Node-only); phrase.ts: phraseKey
                              words.ts: the word tokenizer and shard layout
                              cli.ts: `pnpm load` entry point
src/retrieval/                engine.ts: RetrievalEngine; reader.ts: RangeReader (fetch)
                              reader-node.ts: FsRangeReader, kept out of the browser bundle
                              words.ts: FetchWordIndex; words-node.ts: FsWordIndex
src/dialog/                   ast.ts, parser.ts, session.ts, stream.ts, render5.ts (+ renderFor), map.ts
src/terminal/                 discipline.ts (pure line discipline); sink.ts (the DOM sink)
src/inspect/panel.ts         the inspect panel (describeLine, mountInspect); the only DOM in src/inspect
src/app/                      main.ts (wiring); statement.ts (reconstruction statement + prose)
src/cast/asciicast.ts        buildCast: the character stream as an asciicast v2 recording
config/                      base.ts (the app's base path); define.ts (version and registry hash, shared by
                              vite.config.ts and vitest.config.ts)
scripts/                     extract-corpus.py, naive-split.py, cast.ts, poster.ts, registry-report.ts,
                              verify-remote.ts, upload-corpus.sh, build-for-site.sh
casts/                       first-session.cast and its plain-text poster
fixtures/                    ACCEPTANCE.md, SOURCES.md, the sample record, the acceptance JSON
test/archival/, test/evidence/, test/regression/   see each file's own header comment
```

## The first research session

`fixtures/ACCEPTANCE.md` states the acceptance question, its independent
(`grep`-equivalent) answer in `fixtures/acceptance-fy94.json`, and the dated
run record for the session it requires: `B 60`, `S CY=BELTSVILLE`, `S S1 AND
IN=<name>`, `T S2/5/1`, and the typed record inspected back to its byte
offset.

## Recording

`casts/first-session.cast` is an asciicast v2 recording
(https://docs.asciinema.org/manual/asciicast/v2/) of the acceptance session
above, built from the character stream itself rather than screen-captured:
`pnpm cast` (`scripts/cast.ts`) wires `RetrievalEngine` and `DialogSession`
exactly as the app does, runs `B 60`, `S CY=BELTSVILLE`, `S S1 AND
IN=HAMMERSCHLAG  F A`, `T S2/5/1`, and hands every output line plus the
reconstruction statement to `src/cast/asciicast.ts`'s `buildCast`, a pure
function with no dependency on the DOM or on `DialogSession` itself. The
recording carries the reconstruction statement as its own first frames, and
the header's custom `x-reconstruction` object repeats it machine-readably
alongside the corpus sha256, the software version, and the registry hash --
the same integrity facts the on-screen statement panel carries (see
[Reading the panels](evidence.md#reading-the-panels)). The recording does
not list the registry keys the run applied; the registry file is the list.

Playback is paced, not instant: registry key `cast.pacing` (`chosen`)
labels the recording's own speed -- 120 characters per second for output,
8 characters per second while a command is shown being typed, a 0.6 second
pause after each command -- and its claim says plainly what that pacing is
and is not: a chosen pace for watching the recording, not a transmission
speed any 1990-1994 session is known to have used. (`terminal.pacing`, also
`chosen`, is the separate key for the rate at which the live app prints
characters: 120 per second, a speed documented for DIALOG access in
1984-1988, with no source recording the speed of a File 60 session -- see
[the registry listing](evidence.md#documented-inferred-chosen).) The recording's theme uses the app's own
neutral ground and ink, `#ffffff` and `#111111`: no CRT, scanline, phosphor,
sound, or colour claim.

The BARC story site embeds this recording with the asciinema player
(https://github.com/asciinema/asciinema-player). A click-through from the
embedded recording to a running instance of this reconstruction is possible
because the corpus is hosted; see [Hosting](hosting.md).

## Display modes

Three display modes, cycled by the bar's control or Alt+S: printout keeps
every scrollback line and lets the pane scroll; screen keeps only the last
`terminal.screen_rows` lines; paper restyles the same retained scrollback as
one continuous fixed-pitch sheet, bounded at the app's 80-column measure,
with the tractor-feed strip every 1993-94 printout in the corpus of evidence
carries down the left edge and the searcher's typed commands printed heavier
than DIALOG's output, as the local terminal's own double-struck echo did.
The sheet shows no paper colour, striping, perforations, or page marks --
the surviving printouts are photocopies, which destroy stock and ribbon
colour, so the sheet makes no claim about what the paper looked like.
Switching into paper mode holds the sheet empty for 600 ms before the
printout appears, skipped under reduced motion and when the mode is read
back from `localStorage` on load; leaving paper restores the rest of the
page at once. A browser print of the page, in any display mode, yields the
same sheet: this is a consequence of the layout paper mode already applies,
not a separate feature.

## Archival tests and the corpus file

`data/RG164.CRIS.FY94.txt` is gitignored (`scripts/extract-corpus.py` produces it from the
WACZ capture; see `data/README.md`). Tests under `test/archival/` read it directly -- they
are the only automated check that runs the real code paths against the real 277 MB file
rather than a fixture. On a fresh clone, or any machine without the file, those tests fail
loudly by default, naming the missing file and the extraction script, rather than silently
skipping and letting `pnpm test` report success without ever touching the corpus. Set
`CRIS_CORPUS_OPTIONAL=1` to opt out and skip them instead (`CRIS_CORPUS_OPTIONAL=1 pnpm
test`).

One layer has no automated test at all: `src/app/main.ts`, the wiring that
fetches the indexes, builds the engine and session, and mounts the terminal
and the panels. It runs top-level `fetch` and `document` access on load, so
it is checked by driving the app in a browser, not by the suite. Everything
below it (the parser, the session, the engine, the sink, the panels) is
tested without it.

## Typechecking

`pnpm typecheck` runs `tsc --noEmit` over the root project and over
`packages/cris-formatb` (its own `tsconfig.json`, checked separately because it
is a distinct workspace package). `pnpm test` does not typecheck -- Vitest
transpiles but does not type-check test and source files -- so `pnpm
typecheck` is a separate, required step before a change is done.

## Using the reader package from another workspace project

`packages/cris-formatb` is the shared Format B reader; other workspace
projects should call its CLI rather than writing their own line splitter
(paths are resolved from the package's own directory):

```
pnpm --filter @barcstory/cris-formatb exec tsx src/cli.ts scan <path to>/data/RG164.CRIS.FY94.txt
pnpm --filter @barcstory/cris-formatb exec tsx src/cli.ts record fixtures/fy94-9049442.bin 83052 --base-line 83052 --profile fy1991plus
```

`--base-line` (default 1) states the absolute corpus line number of the
given file's first byte -- 1 for the whole corpus file, a record's own
first line for a slice fixture that begins there. `--profile` (default
`fy1991plus`) selects the encoding profile `record` parses with.
