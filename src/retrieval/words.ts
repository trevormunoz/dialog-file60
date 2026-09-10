import { wordShardUrl, wordTermsUrl, type UrlEnv } from "../loader/corpus-urls";
import type { WordIndex } from "../loader/corpus-format";

/** One suffix code's word index, loaded a shard at a time. `shard` returns the term ->
 * postings map for one first-character shard (src/loader/words.ts's shardOf); `terms`
 * returns every term the code carries, paired with its postings count, for the EXPAND browse
 * list (not used by search()). A code this source has never heard of is not this interface's problem to report --
 * RetrievalEngine checks the code against WORD_CODES before calling either method. */
export interface WordIndexSource {
  shard(code: string, shard: string): Promise<Record<string, number[]>>;
  terms(code: string): Promise<[string, number][]>;
}

/** Browser: one HTTP request per shard, made only the first time a search needs it (spec
 * 10). `env` is the same Vite/build environment src/app/main.ts passes to every other corpus
 * URL, so a corpus-base change reaches word shards the same way it reaches everything else. */
export class FetchWordIndex implements WordIndexSource {
  constructor(private env: UrlEnv) {}
  async shard(code: string, shard: string): Promise<Record<string, number[]>> {
    const res = await fetch(wordShardUrl(code, shard, this.env));
    return (await res.json()) as Record<string, number[]>;
  }
  async terms(code: string): Promise<[string, number][]> {
    const res = await fetch(wordTermsUrl(code, this.env));
    return (await res.json()) as [string, number][];
  }
}

// FsWordIndex is kept out of this file, in ./words-node -- the module src/app/main.ts
// imports for the browser (this one, for FetchWordIndex) must carry no node: specifier,
// static or dynamic (test/regression/loader-build-browser-safe.test.ts), the same reason
// FsRangeReader is kept out of ./reader in ./reader-node.

/** Tests: a WordIndex already held in memory, no file or network access at all. */
export class MemoryWordIndex implements WordIndexSource {
  constructor(private words: Record<string, WordIndex>) {}
  async shard(code: string, shard: string): Promise<Record<string, number[]>> {
    return this.words[code]?.shards[shard] ?? {};
  }
  async terms(code: string): Promise<[string, number][]> {
    return this.words[code]?.terms ?? [];
  }
}
