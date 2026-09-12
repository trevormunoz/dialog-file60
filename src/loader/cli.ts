import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { buildIndexes } from "./index-builder";
import { checkFixity, type Fixity } from "./fixity";
import { registry } from "../registry";
import { wordDir, MERGED_WORD_DIR } from "./corpus-urls";
import { POSITIONAL_CODES } from "./words";

// Node-only entry point (`pnpm load`); never imported by src/app/main.ts or any browser code.
const file = "RG164.CRIS.FY94.txt";
const bytes = new Uint8Array(readFileSync(`data/${file}`));
// Refuse to write indexes from a file that does not match the fixity
// recorded in registry.get("nara.file.fy1994_fixity") -- a wrong or corrupted corpus file
// should stop the loader with a message naming both the expected and actual values, not
// silently produce a wrong index.
checkFixity(bytes, registry.get("nara.file.fy1994_fixity").value as Fixity);
// buildIndexes()'s third argument defaults to POSITIONAL_CODES (/TI and /DE), the codes
// version 1 actually ships (decision (a): the full eight-code positional index measures over
// the 150 MB bucket-addition ceiling; see docs/indexes.md) -- the default is taken here
// explicitly rather than left implicit, so this call site stays obviously correct even if the
// default ever changes.
const { offsets, indexes, words, positions, report, mergedTerms } = buildIndexes(bytes, file, POSITIONAL_CODES);
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
const mergedDir = `public/corpus/word/${MERGED_WORD_DIR}`;
mkdirSync(mergedDir, { recursive: true });
writeFileSync(`${mergedDir}/terms.json`, JSON.stringify(mergedTerms));
// positions has an entry per WORD_CODES key, but only POSITIONAL_CODES's are populated (the
// call above), so this loop writes only those to disk -- decision (a): the full eight-code
// positional index measures over this reconstruction's 150 MB bucket-addition ceiling
// (docs/indexes.md), so version 1 ships positions for /TI and /DE only.
for (const [code, byShard] of Object.entries(positions)) {
  if (!POSITIONAL_CODES.includes(code)) continue;
  const dir = `public/corpus/pos/${wordDir(code)}`;
  mkdirSync(dir, { recursive: true });
  for (const [shard, data] of Object.entries(byShard)) writeFileSync(`${dir}/${shard}.json`, JSON.stringify(data));
  // Same empty-shard convention as the word shards above: shardOf() never returns "_" on real
  // data, but the sharding scheme names it, so a query-side lookup gets {} instead of a 404.
  if (!("_" in byShard)) writeFileSync(`${dir}/_.json`, JSON.stringify({}));
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
console.log(
  "phrase terms: " + Object.entries(report.phraseTerms).map(([c, n]) => `${c} ${n}`).join(", ")
);
console.log(
  `positional postings (computed for ${POSITIONAL_CODES.join(", ")} only -- decision (a), see ` +
  "docs/indexes.md): " + Object.entries(report.posPostings).map(([c, n]) => `${c} ${n}`).join(", ")
);
console.log(
  "positional bytes: " + Object.entries(report.posBytes).map(([c, n]) => `${c} ${n}`).join(", ")
);
