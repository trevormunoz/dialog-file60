import { readFileSync } from "node:fs";
import { FsRangeReader } from "../../src/retrieval/reader-node";
import { FetchRangeReader } from "../../src/retrieval/reader";

const FIXTURE_PATH = "packages/cris-formatb/fixtures/fy94-9049442.bin";
const FIXTURE_OFFSET = 6810182; // byte offset of line 83052 in the FY94 corpus
const fixture = new Uint8Array(readFileSync(FIXTURE_PATH));

test("FsRangeReader reads exactly the requested span", async () => {
  const reader = new FsRangeReader(FIXTURE_PATH);
  const bytes = await reader.read(0, fixture.length);
  expect(bytes.length).toBe(fixture.length);
  expect(Array.from(bytes)).toEqual(Array.from(fixture));
});

test("FsRangeReader rejects a read past the end of the file instead of returning NUL-padded bytes", async () => {
  const reader = new FsRangeReader(FIXTURE_PATH);
  await expect(reader.read(0, fixture.length + 10000)).rejects.toThrow(/short read/);
});

test("FetchRangeReader rejects a short 206 body", async () => {
  const requested = 100;
  const short = new Uint8Array(requested - 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(short, { status: 206 })) as typeof fetch;
  try {
    const reader = new FetchRangeReader("https://example.test/corpus.txt");
    await expect(reader.read(FIXTURE_OFFSET, requested)).rejects.toThrow(/short range response/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FetchRangeReader rejects a non-206 response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array(0), { status: 200 })) as typeof fetch;
  try {
    const reader = new FetchRangeReader("https://example.test/corpus.txt");
    await expect(reader.read(FIXTURE_OFFSET, 100)).rejects.toThrow(/range request not honored/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FetchRangeReader returns the exact bytes on a full 206 body", async () => {
  const requested = fixture.length;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(fixture, { status: 206 })) as typeof fetch;
  try {
    const reader = new FetchRangeReader("https://example.test/corpus.txt");
    const bytes = await reader.read(FIXTURE_OFFSET, requested);
    expect(Array.from(bytes)).toEqual(Array.from(fixture));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Without an assertion on the Range header's own bytes= value, an off-by-one
// in the inclusive byte range (the browser's only path to record bytes) could pass every test
// here while breaking real range requests.
test("FetchRangeReader sends an inclusive Range header", async () => {
  const requested = 82;
  let seenRange: string | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    seenRange = (init?.headers as Record<string, string> | undefined)?.Range;
    return new Response(new Uint8Array(requested), { status: 206 });
  }) as typeof fetch;
  try {
    const reader = new FetchRangeReader("https://example.test/corpus.txt");
    await reader.read(FIXTURE_OFFSET, requested);
    expect(seenRange).toBe(`bytes=${FIXTURE_OFFSET}-${FIXTURE_OFFSET + requested - 1}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
