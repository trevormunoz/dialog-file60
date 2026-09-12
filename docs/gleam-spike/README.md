# Gleam-behind-a-facade spike (Format B scanner + parser)

A throwaway feasibility spike, preserved as the evidence behind
`docs/superpowers/specs/2026-09-12-extract-cris-formatb-design.md`. It answers
one question: **can a Gleam implementation of the Format B reader sit behind the
`@barcstory/cris-formatb` package surface without its TypeScript consumers
noticing?**

Answer: **yes**, for both functions every consumer depends on — `scanRecords`
and `parseRecord` — with byte-for-byte-identical output to the current TS
implementation (`packages/cris-formatb/src/offsets.ts` + `record.ts`), using the
idiomatic Gleam→JS mechanisms (generated `.d.ts`, the v1.13 `$`-API, Gleam-side
`List`→`Array` conversion).

## Layout

```
gleam_scan/            a Gleam project, JS target
  gleam.toml           typescript_declarations = true; stdlib + gleam_javascript
  src/gleam_scan.gleam the engine: scan_records + parse_record (literal port)
facade.ts              the TS boundary: marshals Gleam <-> the TS public shapes
run.ts                 parity harness: facade vs. the real TS, same inputs
```

## Running it

```sh
cd gleam_scan && gleam build --target javascript && cd ..
# from the repo root, using the repo's tsx:
node_modules/.bin/tsx docs/gleam-spike/run.ts
```

Expected: `11 passed, 0 failed` — scan + parse parity across a synthetic record
(engineered to hit every branch: separators, percent-in-block, `0xAC`
continuation, raw-concat continuation, orphan continuation), both profiles, both
real fixtures, plus identical throw on a malformed-length buffer.

## Status and caveats

- This is the **literal (parity) port** — it mirrors the TS statement-by-statement
  on purpose, so it is a mechanically comparable oracle. It is **not** the
  idiomatic rewrite; that design lives in the spec (physical-line model, `LineKind`
  classification, `ScannerMode`/`OpenRecord` state machine, bit-array patterns,
  module split).
- The malformed-length guard is in `facade.ts` (matching `offsets.ts:36`'s throw)
  rather than the Gleam scanner; the idiomatic version models it as a diagnostic.
- `gleam_scan/build/` is gitignored; run `gleam build` to regenerate it.
- Research behind the idiomatic decisions: `research-notes.md`.
