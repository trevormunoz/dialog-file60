import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { buildIndexes } from "./index-builder";
import { checkFixity, type Fixity } from "./fixity";
import { registry } from "../registry";
import { wordDir } from "./corpus-urls";

// Node-only entry point (`pnpm load`); never imported by src/app/main.ts or any browser code.
const file = "RG164.CRIS.FY94.txt";
const bytes = new Uint8Array(readFileSync(`data/${file}`));
// Refuse to write indexes from a file that does not match the fixity
// recorded in registry.get("nara.file.fy1994_fixity") -- a wrong or corrupted corpus file
// should stop the loader with a message naming both the expected and actual values, not
// silently produce a wrong index.
checkFixity(bytes, registry.get("nara.file.fy1994_fixity").value as Fixity);
const { offsets, indexes, words, report } = buildIndexes(bytes, file);
mkdirSync("public/corpus/index", { recursive: true });
writeFileSync("public/corpus/offsets.json", JSON.stringify(offsets));
for (const [code, idx] of Object.entries(indexes)) writeFileSync(`public/corpus/index/${code}.json`, JSON.stringify(idx));
for (const [code, w] of Object.entries(words)) {
  const dir = `public/corpus/word/${wordDir(code)}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/terms.json`, JSON.stringify(w.terms));
  for (const [shard, terms] of Object.entries(w.shards)) writeFileSync(`${dir}/${shard}.json`, JSON.stringify(terms));
  // tokenize() never emits a term starting outside A-Z0-9, so shardOf() never returns "_" on
  // real data and w.shards["_"] is never populated -- but the sharding scheme (index.word.shards)
  // and scripts/upload-corpus.sh both name "_" as a shard. Write it empty so a query-side lookup
  // of a non-alphanumeric-leading term gets {} instead of a 404.
  if (!("_" in w.shards)) writeFileSync(`${dir}/_.json`, JSON.stringify({}));
}
writeFileSync("public/corpus/report.json", JSON.stringify(report, null, 1));
console.log(
  `records ${offsets.records.length}; composite mismatches ${report.compositeMismatches.length}; ` +
  `bad lines ${report.badLines}; orphan continuations ${report.orphanContinuations}; ` +
  `gc mismatches ${report.gcMismatches.length}; sc/sn mismatches ${report.scSnMismatches.length}`
);
console.log(
  "word terms: " + Object.entries(report.wordTerms).map(([c, n]) => `${c} ${n}`).join(", ")
);
