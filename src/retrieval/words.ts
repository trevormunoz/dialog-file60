import { wordShardUrl, wordTermsUrl, mergedWordTermsUrl, type UrlEnv } from "../loader/corpus-urls";
import type { WordIndex } from "../loader/corpus-format";

/** One suffix code's word index, loaded a shard at a time. `shard` returns the term ->
 * postings map for one first-character shard (src/loader/words.ts's shardOf); `terms`
 * returns every term the code carries, paired with its postings count, for the EXPAND browse
 * list (not used by search()). `mergedTerms` returns the prebuilt merged Basic Index term
 * list (the union of /TX, /TI, /DE and /PB, src/loader/index-builder.ts), read whole rather
 * than assembled from every code's shards for a bare EXPAND. A code this source has never
 * heard of is not this interface's problem to report -- RetrievalEngine checks the code
 * against WORD_CODES before calling either of the other methods. */
export interface WordIndexSource {
  shard(code: string, shard: string): Promise<Record<string, number[]>>;
  terms(code: string): Promise<[string, number][]>;
  mergedTerms(): Promise<[string, number][]>;
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
  async mergedTerms(): Promise<[string, number][]> {
    const res = await fetch(mergedWordTermsUrl(this.env));
    return (await res.json()) as [string, number][];
  }
}

// FsWordIndex is kept out of this file, in ./words-node -- the module src/app/main.ts
// imports for the browser (this one, for FetchWordIndex) must carry no node: specifier,
// static or dynamic (test/regression/loader-build-browser-safe.test.ts), the same reason
// FsRangeReader is kept out of ./reader in ./reader-node.

const MERGED_CODES = ["/TX", "/TI", "/DE", "/PB"] as const;

/** Tests: a WordIndex already held in memory, no file or network access at all. No prebuilt
 * merged-terms file exists for an in-memory index, so mergedTerms() unions the four codes'
 * shards directly -- the same union src/loader/index-builder.ts computes once for the real
 * loader output. */
export class MemoryWordIndex implements WordIndexSource {
  constructor(private words: Record<string, WordIndex>) {}
  async shard(code: string, shard: string): Promise<Record<string, number[]>> {
    return this.words[code]?.shards[shard] ?? {};
  }
  async terms(code: string): Promise<[string, number][]> {
    return this.words[code]?.terms ?? [];
  }
  async mergedTerms(): Promise<[string, number][]> {
    const union = new Map<string, Set<number>>();
    for (const code of MERGED_CODES) {
      for (const shard of Object.values(this.words[code]?.shards ?? {})) {
        for (const [term, postings] of Object.entries(shard)) {
          const set = union.get(term) ?? new Set<number>();
          for (const o of postings) set.add(o);
          union.set(term, set);
        }
      }
    }
    return [...union.entries()].map(([term, set]): [string, number] => [term, set.size]);
  }
}
