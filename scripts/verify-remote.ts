/**
 * The deploy-time check that the public copy of the corpus IS the
 * corpus, and that the host serving it honours byte ranges.
 *
 * Two checks, in this order:
 *   1. Stream the whole object and compare its byte count and sha256 against the registry's
 *      nara.file.fy1994_fixity, through the same checkFixity() the loader uses. R2's ETag is
 *      a multipart composite after an upload this size and is not a hash of the content, so
 *      it cannot stand in for this.
 *   2. Ask for the 10,004 bytes of AN 9049442 at offset 6,810,182 and compare them
 *      byte-for-byte against packages/cris-formatb/fixtures/fy94-9049442.bin. This is the
 *      one check that proves the host actually answers 206 with the right bytes -- the
 *      browser's only path to record content.
 * Then every derived artifact is fetched and its size reported.
 *
 * Exported as a function so test/regression/verify-remote.test.ts can drive it with a stubbed
 * fetch: a Vitest test never touches the network and never spawns a subprocess.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkFixity, type Fixity } from "../src/loader/fixity";
import { PHRASE_FIELDS } from "../src/loader/corpus-format";
import { WORD_CODES, shardOf } from "../src/loader/words";
import { wordDir } from "../src/loader/corpus-urls";
import { registry } from "../src/registry";

const CORPUS_FILE = "RG164.CRIS.FY94.txt";
const FIXTURE_PATH = "packages/cris-formatb/fixtures/fy94-9049442.bin";
const FIXTURE_OFFSET = 6810182;

export interface RemoteReport {
  baseUrl: string;
  corpusBytes: number;
  corpusSha256: string;
  rangeStatus: number;
  rangeBytes: number;
  rangeMatchesFixtureBytes: boolean;
  indexes: { code: string; status: number; bytes: number }[];
  words: { code: string; shard: string; termsBytes: number; shardBytes: number }[];
}

export interface VerifyOpts {
  fetchImpl?: typeof fetch;
  expected?: Fixity;
  fixture?: Uint8Array;
  fixtureOffset?: number;
}

export async function verifyRemote(baseUrl: string, opts: VerifyOpts = {}): Promise<RemoteReport> {
  const f = opts.fetchImpl ?? fetch;
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const expected = opts.expected ?? (registry.get("nara.file.fy1994_fixity").value as Fixity);
  const fixture = opts.fixture ?? new Uint8Array(readFileSync(FIXTURE_PATH));
  const fixtureOffset = opts.fixtureOffset ?? FIXTURE_OFFSET;

  const corpusUrl = `${base}${CORPUS_FILE}`;
  const whole = await f(corpusUrl);
  if (!whole.ok) throw new Error(`${corpusUrl}: HTTP ${whole.status} ${whole.statusText}`);
  const bytes = new Uint8Array(await whole.arrayBuffer());
  checkFixity(bytes, expected);
  const corpusSha256 = createHash("sha256").update(bytes).digest("hex");

  const ranged = await f(corpusUrl, {
    headers: { Range: `bytes=${fixtureOffset}-${fixtureOffset + fixture.length - 1}` },
  });
  if (ranged.status !== 206) {
    throw new Error(`range request not honored by ${corpusUrl}: HTTP ${ranged.status}`);
  }
  const rangeBytes = new Uint8Array(await ranged.arrayBuffer());
  const rangeMatchesFixtureBytes =
    rangeBytes.length === fixture.length && rangeBytes.every((b, i) => b === fixture[i]);
  if (!rangeMatchesFixtureBytes) {
    throw new Error(
      `the ${fixture.length} bytes at offset ${fixtureOffset} of ${corpusUrl} are not the ` +
      `bytes of AN 9049442 recorded in ${FIXTURE_PATH} (got ${rangeBytes.length} bytes)`,
    );
  }

  const indexes: RemoteReport["indexes"] = [];
  for (const url of [`${base}offsets.json`, ...PHRASE_FIELDS.map(c => `${base}index/${c}.json`)]) {
    const res = await f(url);
    if (!res.ok) throw new Error(`${url.slice(base.length)}: HTTP ${res.status} ${res.statusText}`);
    const body = await res.arrayBuffer();
    const code = url.endsWith("offsets.json") ? "offsets" : url.slice(-7, -5);
    if (code !== "offsets") indexes.push({ code, status: res.status, bytes: body.byteLength });
  }

  // The word indexes are too many small files to list one by
  // one, so this checks one deterministic shard per code -- the shard of terms.json's first
  // term, the same file a browser search for that term would fetch.
  const words: RemoteReport["words"] = [];
  for (const code of WORD_CODES) {
    const dir = wordDir(code);
    const termsUrl = `${base}word/${dir}/terms.json`;
    const termsRes = await f(termsUrl);
    if (!termsRes.ok) throw new Error(`${termsUrl.slice(base.length)}: HTTP ${termsRes.status} ${termsRes.statusText}`);
    const termsBytes = new Uint8Array(await termsRes.arrayBuffer());
    if (termsBytes.length === 0) throw new Error(`${termsUrl.slice(base.length)}: empty body`);
    const terms = JSON.parse(new TextDecoder().decode(termsBytes)) as [string, number][];
    const firstTerm = terms[0]?.[0];
    if (!firstTerm) throw new Error(`${termsUrl.slice(base.length)}: no terms to choose a shard from`);
    const shard = shardOf(firstTerm);
    const shardUrl = `${base}word/${dir}/${shard}.json`;
    const shardRes = await f(shardUrl);
    if (!shardRes.ok) throw new Error(`${shardUrl.slice(base.length)}: HTTP ${shardRes.status} ${shardRes.statusText}`);
    const shardBytes = new Uint8Array(await shardRes.arrayBuffer());
    if (shardBytes.length === 0) throw new Error(`${shardUrl.slice(base.length)}: empty body`);
    words.push({ code, shard, termsBytes: termsBytes.length, shardBytes: shardBytes.length });
  }

  return {
    baseUrl: base,
    corpusBytes: bytes.length,
    corpusSha256,
    rangeStatus: ranged.status,
    rangeBytes: rangeBytes.length,
    rangeMatchesFixtureBytes,
    indexes,
    words,
  };
}

// Entry point for `pnpm verify:remote <base-url>`. Guarded so importing this module from a
// test does not run it.
if (process.argv[1]?.endsWith("verify-remote.ts")) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("usage: pnpm verify:remote <base-url>");
    process.exit(1);
  }
  const report = await verifyRemote(baseUrl);
  console.log(
    `${report.baseUrl}\n` +
    `corpus ${report.corpusBytes} bytes, sha256 ${report.corpusSha256} (matches the registry)\n` +
    `range GET at ${FIXTURE_OFFSET}: HTTP ${report.rangeStatus}, ${report.rangeBytes} bytes, ` +
    `byte-identical to ${FIXTURE_PATH}\n` +
    report.indexes.map(i => `index/${i.code}.json ${i.bytes} bytes`).join("\n") + "\n" +
    report.words.map(w =>
      `word/${wordDir(w.code)}/terms.json ${w.termsBytes} bytes, ` +
      `word/${wordDir(w.code)}/${w.shard}.json ${w.shardBytes} bytes`,
    ).join("\n"),
  );
}
