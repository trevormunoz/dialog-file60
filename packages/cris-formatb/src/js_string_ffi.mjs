// JS's own trims, reached from js_string.gleam via @external. The oracle
// (src-ts/record.ts, src-ts/offsets.ts) calls .trim()/.trimEnd() directly, so
// on the JS target these ARE the oracle's functions. No imports: this file is
// bundled into dist/engine.mjs and must stay dependency-free.
export function trim_end(s) {
  return s.trimEnd();
}

export function trim(s) {
  return s.trim();
}
