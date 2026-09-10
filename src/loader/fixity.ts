import { createHash } from "node:crypto";

// Node-only (node:crypto), like index-builder.ts; not part of corpus-format.ts's browser-safe
// surface and never imported by src/app/main.ts.

export interface Fixity { bytes: number; sha256: string; }

/** Thrown by checkFixity when the given bytes do not match the expected size and sha256. */
export class FixityMismatchError extends Error {}

/**
 * Refuses to proceed when `data` does not match `expected`'s byte count and sha256 -- the
 * guard src/loader/cli.ts uses before writing indexes from
 * data/RG164.CRIS.FY94.txt, so a corrupted or wrong file cannot silently produce a wrong
 * index instead of an error. Pure aside from the hash itself, so it is testable with a small
 * synthetic buffer instead of the real 277 MB corpus.
 */
export function checkFixity(data: Uint8Array, expected: Fixity): void {
  const actualSha256 = createHash("sha256").update(data).digest("hex");
  if (data.length !== expected.bytes || actualSha256 !== expected.sha256) {
    throw new FixityMismatchError(
      `corpus does not match its recorded fixity (registry nara.file.fy1994_fixity): ` +
      `expected ${expected.bytes} bytes, sha256 ${expected.sha256}; got ${data.length} bytes, sha256 ${actualSha256}`,
    );
  }
}
