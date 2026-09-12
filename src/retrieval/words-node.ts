// FsWordIndex and FsPositional are kept out of ./words, the module src/app/main.ts imports
// for the browser (for FetchWordIndex and FetchPositional). Even though the node:fs/promises
// import below is dynamic (only ever
// executed in Node), Vite detects the specifier as reachable from main.ts's import graph and
// externalizes it, printing a warning on every `pnpm build` -- the same reason FsRangeReader
// is kept out of ./reader in ./reader-node. In its own Node-only module the browser graph
// contains no node: specifier at all; the browser never imports this file.
import { wordDir, MERGED_WORD_DIR, POS_DIR } from "../loader/corpus-urls";
import type { WordIndexSource, PositionalSource } from "./words";
import type { PositionalShard } from "../loader/corpus-format";
import { ReconstructionFailure } from "./failures";

/** Read one JSON artifact from disk, turning ENOENT into ArtifactUnavailable and an unparseable
 * body into ArtifactInvalid -- the Node-side counterpart of fetchJsonArtifact's transport/parse
 * handling for src/retrieval/artifact.ts's browser fetch path. */
async function readJson(path: string): Promise<unknown> {
  const { readFile } = await import("node:fs/promises");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    throw new ReconstructionFailure("ArtifactUnavailable", { url: path, detail: String(e) });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ReconstructionFailure("ArtifactInvalid", { url: path, detail: `not JSON: ${String(e)}` });
  }
}

/** Node: the word-index shard and terms files, read from disk under `root` (public/corpus in
 * this tree). Used by scripts/cast.ts and the archival tests, which run in Node rather than a
 * browser and so read the corpus directly instead of over HTTP. */
export class FsWordIndex implements WordIndexSource {
  constructor(private root: string) {}
  shard(code: string, shard: string): Promise<Record<string, number[]>> {
    return readJson(`${this.root}/word/${wordDir(code)}/${shard}.json`) as Promise<Record<string, number[]>>;
  }
  terms(code: string): Promise<[string, number][]> {
    return readJson(`${this.root}/word/${wordDir(code)}/terms.json`) as Promise<[string, number][]>;
  }
  mergedTerms(): Promise<[string, number][]> {
    return readJson(`${this.root}/word/${MERGED_WORD_DIR}/terms.json`) as Promise<[string, number][]>;
  }
}

/** Node: the positional-index shard files, read from disk under `root` (public/corpus in this
 * tree) -- the FsWordIndex of the positional side, for the same Node-only callers. */
export class FsPositional implements PositionalSource {
  constructor(private root: string) {}
  positions(code: string, shard: string): Promise<PositionalShard> {
    return readJson(`${this.root}/${POS_DIR}/${wordDir(code)}/${shard}.json`) as Promise<PositionalShard>;
  }
}
