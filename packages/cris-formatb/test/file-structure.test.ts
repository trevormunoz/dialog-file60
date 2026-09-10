import { scanRecords } from "../src/offsets";

/** Builds one 82-byte line: `text` left-justified, space-padded, CRLF-terminated. */
function makeLine(text: string): Uint8Array {
  const b = new Uint8Array(82).fill(0x20);
  for (let i = 0; i < text.length; i++) b[i] = text.charCodeAt(i);
  b[80] = 0x0d; b[81] = 0x0a;
  return b;
}

function buffer(lines: string[]): Uint8Array {
  const out = new Uint8Array(lines.length * 82);
  lines.forEach((l, i) => out.set(makeLine(l), i * 82));
  return out;
}

test("a '<<' line opens no record and is captured as the file header, not silently dropped", () => {
  const buf = buffer(["<< 000000000001", "$$", "AN 1234567"]);
  const { spans, structure } = scanRecords(buf, 1);
  expect(structure.header).toBe("<< 000000000001");
  expect(spans).toHaveLength(1);
  expect(spans[0]!.firstLine).toBe(2); // the "$$" line, not the header line before it
});

test("a '>>' line closes the open span before it, excludes itself, and is captured as the file trailer", () => {
  const buf = buffer(["$$", "AN 1234567", ">> 000000001000000001"]);
  const { spans, structure } = scanRecords(buf, 1);
  expect(structure.trailer).toBe(">> 000000001000000001");
  expect(spans).toHaveLength(1);
  expect(spans[0]!.lastLine).toBe(2); // excludes the trailer line
  expect(spans[0]!.length).toBe(2 * 82);
});

test("with no header or trailer line, structure is empty and spans are unaffected", () => {
  const buf = buffer(["$$", "AN 1234567"]);
  const { spans, structure } = scanRecords(buf, 1);
  expect(structure).toEqual({});
  expect(spans).toHaveLength(1);
  expect(spans[0]!.lastLine).toBe(2);
});

test("badLines counts a line whose last two bytes are not CRLF", () => {
  const buf = buffer(["$$", "AN 1234567"]);
  buf[81] = 0x20; // corrupt the first line's trailing LF
  const { badLines } = scanRecords(buf, 1);
  expect(badLines).toBe(1);
});

test("a clean buffer has zero bad lines", () => {
  const buf = buffer(["$$", "AN 1234567"]);
  expect(scanRecords(buf, 1).badLines).toBe(0);
});
