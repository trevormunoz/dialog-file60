#!/usr/bin/env bash
# Uploads the corpus and the loader's derived artifacts to one R2 prefix.
#
# The corpus is 277,539,004 bytes and must arrive byte-identical. wrangler's PUT returns an
# ETag that, for an object this size, is a multipart composite rather than an MD5 -- NOT a
# fixity check. The fixity check is `pnpm verify:remote`, which streams the object back and
# compares its sha256 against the registry's nara.file.fy1994_fixity. Run it after this.
#
# public/corpus/report.json is deliberately not uploaded: it is a derived QC artifact that
# no reader or the app ever fetches, and verify-remote.ts's own check list never asks for it.
set -euo pipefail

BUCKET="${R2_BUCKET:-barcstory-cris}"
PREFIX="${R2_PREFIX:-v1}"
CACHE="public, max-age=31536000, immutable"

cd "$(dirname "$0")/.."

test -f data/RG164.CRIS.FY94.txt || { echo "data/RG164.CRIS.FY94.txt is missing; see data/README.md" >&2; exit 1; }
test -f public/corpus/offsets.json || { echo "public/corpus/offsets.json is missing; run pnpm load" >&2; exit 1; }

echo "uploading the corpus (277,539,004 bytes)"
wrangler r2 object put "${BUCKET}/${PREFIX}/RG164.CRIS.FY94.txt" \
  --file data/RG164.CRIS.FY94.txt --remote \
  --content-type "text/plain; charset=iso-8859-1" \
  --cache-control "${CACHE}"

echo "uploading offsets.json"
wrangler r2 object put "${BUCKET}/${PREFIX}/offsets.json" \
  --file public/corpus/offsets.json --remote \
  --content-type "application/json" \
  --cache-control "${CACHE}"

echo "uploading the phrase indexes"
for code in AN CY DS IN SF ST; do
  wrangler r2 object put "${BUCKET}/${PREFIX}/index/${code}.json" \
    --file "public/corpus/index/${code}.json" --remote \
    --content-type "application/json" \
    --cache-control "${CACHE}"
done

# One directory per word-indexed suffix code, each holding terms.json plus one
# shard file per first character (A-Z, 0-9, _). wordDir() (src/loader/corpus-urls.ts) strips
# the "/" and "=" so the directory name is path-safe; this list must match WORD_CODES
# (src/loader/words.ts) mapped through wordDir(), or a code the loader built goes unuploaded.
echo "uploading the word indexes"
for dir in TI OB AP DE DF PR PB TX PO; do
  test -d "public/corpus/word/${dir}" || { echo "public/corpus/word/${dir} is missing; run pnpm load" >&2; exit 1; }
done
# /DE and /DF are byte-identical on disk -- the Blue Sheet documents /DF as an alias of /DE --
# so every word/DF/*.json uploaded here duplicates the matching word/DE/*.json. Resolving the
# alias at query time would avoid that duplicate upload; until something does, the loader
# (src/loader/cli.ts) writes both directories and this script uploads both as they sit on disk.
# Sequential on purpose: 342 small puts, each a wrangler start-up. Filenames are
# loader-generated (A-Z, 0-9, _, terms) so a glob is safe; set -e stops on the first failure.
for f in public/corpus/word/*/*.json; do
  key="${f#public/corpus/}"
  wrangler r2 object put "${BUCKET}/${PREFIX}/${key}" \
    --file "$f" --remote \
    --content-type "application/json" \
    --cache-control "${CACHE}" >/dev/null
  echo "ok ${key}"
done

echo "done. now run: pnpm verify:remote <base url> -- it checks corpus fixity, the ranged read, every phrase index, and each word index's terms.json plus one deterministic shard"
