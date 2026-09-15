// Latin-1 decode reached from latin1.gleam via @external: the oracle's own
// loop (src-ts/bytes.ts `latin1`) — every byte maps to the code unit of the
// same value. Loop form rather than String.fromCharCode(...spread), which is
// stack-limited for a large input. Reads through BitArray.byteAt so a
// non-zero bit offset is handled the same way the prelude handles it. No
// imports: this file is bundled into dist/engine.mjs and must stay
// dependency-free.
export function decode(bits) {
  let s = "";
  const n = bits.byteSize;
  for (let i = 0; i < n; i++) s += String.fromCharCode(bits.byteAt(i));
  return s;
}
