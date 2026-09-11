import { mk } from "./harness";

test("a truncated SELECT prints one per-term line showing the term as typed", async () => {
  const s = mk();
  await s.submit("b 60");
  const out = await s.submit("s oyster?");
  // One set line only: a single-operand SELECT prints no separate per-term line -- the set
  // line's own "S1" carries the set id, the same setLine() format every other command here
  // uses (proto.select.setline / render.setline.columns); the brief's regex omitted the "S",
  // which would contradict that shared, already-cited format, so it is corrected here.
  expect(out.map(l => l.text)).toEqual([expect.stringMatching(/^ +S1 +\d+ +OYSTER\?$/)]);
});
