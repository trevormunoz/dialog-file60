import { mk } from "./harness";

// The item header (`${set.id}/${cmd.format}/${i}`, proto.type.item_header) is printed by
// commands/type.ts from cmd.format directly -- the parser already uppercases the format group
// (parser.ts's TYPE pattern, `m[2]!.toUpperCase()`) -- so this drives a real session end to end
// through the actual renderFor dispatch (formats.ts's user-defined-code branch and format 6),
// not the harness's injected stub, to prove the header takes a code list and "6" verbatim.
test("a user-defined display-code format's item header takes the code list verbatim: t s2/ti,ob/1 prints 2/TI,OB/1", async () => {
  const session = mk();
  await session.submit("b 60");
  await session.submit("S CY=BELTSVILLE");
  await session.submit("S CY=BELTSVILLE");
  const out = await session.submit("t s2/ti,ob/1");
  expect(out.map(l => l.text)).toContain("2/TI,OB/1");
});

test("format 6's item header: t s2/6/1 prints 2/6/1", async () => {
  const session = mk();
  await session.submit("b 60");
  await session.submit("S CY=BELTSVILLE");
  await session.submit("S CY=BELTSVILLE");
  const out = await session.submit("t s2/6/1");
  expect(out.map(l => l.text)).toContain("2/6/1");
});
