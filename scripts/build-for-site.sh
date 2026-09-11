#!/usr/bin/env bash
# Builds the emulator for its home on the BARC story site.
#
# APP_BASE            the path the app is served from. The site's Astro base is
#                     /site-barcstory (set in the site's Astro config) and Astro copies
#                     the site's public/ directory verbatim, so a build placed at
#                     public/file60/ is served at /site-barcstory/file60/.
# VITE_CORPUS_BASE_URL  the R2 prefix. GitHub blocks any file over 100 MB, so the
#                     277,539,004-byte corpus cannot live where the app lives. The R2 bucket
#                     is provisioned outside this script, so this variable stays configurable
#                     with no baked-in default and the caller must supply the real prefix.
#
# vite.config.ts sets publicDir:false whenever APP_BASE is set, so dist/ contains no
# corpus/ -- the symlink in public/corpus/ points at the 277 MB file and would otherwise be
# followed into the output.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${VITE_CORPUS_BASE_URL:?set VITE_CORPUS_BASE_URL to the R2 prefix, e.g. https://corpus.example/v1/}"
SITE="${SITE_REPO:?set SITE_REPO to the site checkout}"
DEST="${SITE}/apps/web/public/file60"

APP_BASE="/site-barcstory/file60/" pnpm build

if [ -e dist/corpus ]; then
  echo "dist/corpus exists; publicDir was not disabled. Refusing to copy." >&2
  exit 1
fi

rm -rf "${DEST}"
mkdir -p "${DEST}"
cp -R dist/. "${DEST}/"
echo "copied $(du -sh "${DEST}" | cut -f1) to ${DEST}"

# The recordings and their transcript fallbacks travel with the build, so the site page and
# the app it links to are always the same version of the reconstruction. Each transcript
# (casts/<name>.poster.txt) is generated separately by scripts/poster.ts, so its copy is
# guarded: without the guard this script would fail under set -euo pipefail whenever the
# transcript has not been generated.
mkdir -p "${SITE}/apps/web/src/data"
for name in friction poultry; do
  cp "casts/${name}.cast" "${SITE}/apps/web/src/data/${name}.cast"
  if [ -f "casts/${name}.poster.txt" ]; then
    cp "casts/${name}.poster.txt" "${SITE}/apps/web/src/data/${name}.poster.txt"
    echo "copied casts/${name}.cast and its transcript to ${SITE}/apps/web/src/data/"
  else
    echo "copied casts/${name}.cast to ${SITE}/apps/web/src/data/ (no poster transcript found)"
  fi
done

echo "done. Serve the site to check it."
