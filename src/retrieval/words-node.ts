// FsWordIndex is kept out of ./words, the module src/app/main.ts imports for the browser
// (for FetchWordIndex). Even though the node:fs/promises import below is dynamic (only ever
// executed in Node), Vite detects the specifier as reachable from main.ts's import graph and
// externalizes it, printing a warning on every `pnpm build` -- the same reason FsRangeReader
// is kept out of ./reader in ./reader-node. In its own Node-only module the browser graph
// contains no node: specifier at all; the browser never imports this file.
import { wordDir } from "../loader/corpus-urls";
import type { WordIndexSource } from "./words";

/** Node: the word-index shard and terms files, read from disk under `root` (public/corpus in
 * this tree). Used by scripts/cast.ts and the archival tests, which run in Node rather than a
 * browser and so read the corpus directly instead of over HTTP. */
export class FsWordIndex implements WordIndexSource {
  constructor(private root: string) {}
  private async read(path: string): Promise<unknown> {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(path, "utf8"));
  }
  shard(code: string, shard: string): Promise<Record<string, number[]>> {
    return this.read(`${this.root}/word/${wordDir(code)}/${shard}.json`) as Promise<Record<string, number[]>>;
  }
  terms(code: string): Promise<[string, number][]> {
    return this.read(`${this.root}/word/${wordDir(code)}/terms.json`) as Promise<[string, number][]>;
  }
}
