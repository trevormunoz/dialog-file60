import { createHash } from "node:crypto";
import { checkFixity, FixityMismatchError } from "../../src/loader/fixity";
import { registry } from "../../src/registry";

const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

test("checkFixity passes silently when bytes match the expected size and sha256", () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const expected = { bytes: data.length, sha256: hash(data) };
  expect(() => checkFixity(data, expected)).not.toThrow();
});

test("checkFixity refuses a byte-count mismatch, naming both the expected and actual byte counts", () => {
  const data = new Uint8Array([1, 2, 3]);
  const expected = { bytes: 999, sha256: hash(data) };
  let caught: unknown;
  try { checkFixity(data, expected); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(FixityMismatchError);
  expect((caught as Error).message).toContain("999");
  expect((caught as Error).message).toContain(String(data.length));
});

test("checkFixity refuses a sha256 mismatch, naming both the expected and actual hashes", () => {
  const data = new Uint8Array([1, 2, 3]);
  const wrongHash = "0".repeat(64);
  const expected = { bytes: data.length, sha256: wrongHash };
  let caught: unknown;
  try { checkFixity(data, expected); } catch (e) { caught = e; }
  expect(caught).toBeInstanceOf(FixityMismatchError);
  expect((caught as Error).message).toContain(wrongHash);
  expect((caught as Error).message).toContain(hash(data));
});

// registry.get("nara.file.fy1994_fixity") is the value src/loader/cli.ts
// checks the real corpus file against. Confirms the registry entry's own shape is what
// checkFixity expects, independent of whether the real corpus is present in this checkout.
test("registry nara.file.fy1994_fixity has the shape checkFixity expects", () => {
  const e = registry.get("nara.file.fy1994_fixity");
  const value = e.value as { bytes: number; sha256: string };
  expect(typeof value.bytes).toBe("number");
  expect(value.sha256).toMatch(/^[0-9a-f]{64}$/);
});
