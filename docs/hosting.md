# Hosting

The archival file and the loader's derived artifacts -- never a parsed copy
of record content -- are the only things uploaded.

**Base URL.** A Cloudflare R2 bucket, served from its `r2.dev` public
development endpoint rather than a custom domain. The URL is not written
down here: the app reads it from `VITE_CORPUS_BASE_URL` at build time, and
the site's deploy workflow supplies it from a repository variable. Cloudflare
documents `r2.dev` as rate-limited and not intended for production traffic;
it is accepted here because this reconstruction's traffic profile is a small
number of researchers, not a public service under load. A custom domain is
one environment variable to change later (`FILE60_CORPUS_BASE_URL`), should
the traffic profile change; no Worker sits in front of the bucket.

**Layout**, under the `v1/` prefix (`v1` is the derived-artifact version;
it is bumped whenever the loader changes the bytes of an object already
uploaded, so `immutable` caching is never a stale-content race; objects
that are only added, such as the 23 phrase indexes added on 2026-09-10 when
the loader grew from 6 phrase prefixes to 29, go under the same prefix):

```
v1/RG164.CRIS.FY94.txt   277,539,004 bytes, byte-identical to data/RG164.CRIS.FY94.txt
v1/offsets.json              933,038 bytes
v1/index/<PREFIX>.json       one per phrase prefix, 29 in all (every documented
                             prefix but SP, which has no values in this corpus);
                             AN 602,533, CY 204,370, DS 197,223, IN 825,444,
                             SF 193,462, ST 194,715 bytes
v1/word/<CODE>/terms.json           one per code, for the eight codes in indexes.md
                                    (/DF resolves to /DE at query time; its 38
                                    objects were deleted from the bucket 2026-09-10)
v1/word/<CODE>/<A-Z,0-9,_>.json     the shards; 304 word-index objects in all,
                                    93,498,835 bytes, the same bytes as on disk
v1/word/_merged/terms.json          4,280,332 bytes: the merged Basic Index term
                                    list with union counts, built by the loader so
                                    a bare EXPAND fetches one file, not the shards
```

`public/corpus/report.json` (a derived QC artifact that no reader or the app
ever fetches) is deliberately not uploaded.

**Uploading.** `scripts/upload-corpus.sh` puts each object with `wrangler r2
object put <bucket>/<key> --file <path> --remote --content-type ... --cache-control
"public, max-age=31536000, immutable"`. `--remote` is required: wrangler v4's
`r2 object put` writes to a *local* simulated bucket unless it is passed
explicitly. `wrangler` handled the 277,539,004-byte corpus object in a
single `put` call.

**CORS.** Set with `wrangler r2 bucket cors set barcstory-cris --file <json>`
(verified with `wrangler r2 bucket cors list`):

```json
{
  "rules": [{
    "allowed": {
      "origins": ["https://trevormunoz.github.io", "http://localhost:5173", "http://localhost:4173"],
      "methods": ["GET", "HEAD"],
      "headers": ["Range", "If-Range", "If-None-Match"]
    },
    "exposeHeaders": ["Content-Range", "Content-Length", "ETag", "Accept-Ranges"],
    "maxAgeSeconds": 3600
  }]
}
```

`FetchRangeReader` sends only `Range: bytes=<digits>-<digits>`, a
CORS-safelisted request header for a simple range value, so no `OPTIONS`
preflight is sent for it; `Access-Control-Allow-Origin` on the 200s and 206s
is what is actually required, because the reader inspects `res.status` and
reads the body.

**Measured record** (2026-09-10, against the live bucket). `HEAD` on the
corpus object: `200`, `Content-Length: 277539004`, `Accept-Ranges: bytes`,
`Cache-Control: public, max-age=31536000, immutable`, `ETag:
"273561e1a16dba1d289627feed88b13c"`. That ETag is a multipart composite from
the upload, not the file's MD5 or sha256 -- fixity is never checked by
comparing it; see Verifying fixity, below. A ranged `GET` with `Range:
bytes=6810182-6820185` and `Origin: https://trevormunoz.github.io`:

```
HTTP/1.1 206 Partial Content
Content-Type: text/plain; charset=iso-8859-1
Content-Length: 10004
Content-Range: bytes 6810182-6820185/277539004
Accept-Ranges: bytes
Access-Control-Allow-Origin: https://trevormunoz.github.io
Cache-Control: public, max-age=31536000, immutable
ETag: "273561e1a16dba1d289627feed88b13c"
Access-Control-Expose-Headers: Content-Range,Content-Length,ETag,Accept-Ranges
```

The response body is byte-identical to
`packages/cris-formatb/fixtures/fy94-9049442.bin` (record AN 9049442, the
same bytes `pnpm verify:remote` checks below).

**Verifying fixity.** `pnpm verify:remote <base-url>` (`scripts/verify-remote.ts`)
is the deploy-time check that the public copy of the corpus IS the corpus.
It streams the whole 277 MB object and runs it through the loader's own
`checkFixity()` against the registry's `nara.file.fy1994_fixity`, then makes
one ranged `GET` for the 10,004 bytes of AN 9049442 at offset 6,810,182 and
compares them byte-for-byte against the committed fixture -- the one check
that proves the host answers `206` with the right bytes, since that is the
browser's only path to record content. Run against the live bucket
2026-09-10:

```
<base url>
corpus 277539004 bytes, sha256 437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a (matches the registry)
range GET at 6810182: HTTP 206, 10004 bytes, byte-identical to packages/cris-formatb/fixtures/fy94-9049442.bin
index/CY.json 204370 bytes
index/IN.json 825444 bytes
index/DS.json 197223 bytes
index/ST.json 194715 bytes
index/SF.json 193462 bytes
index/AN.json 602533 bytes
word/TI/terms.json 328890 bytes, word/TI/0.json 200 bytes
word/OB/terms.json 951582 bytes, word/OB/0.json 1709 bytes
word/AP/terms.json 1281542 bytes, word/AP/0.json 16023 bytes
word/DE/terms.json 530642 bytes, word/DE/0.json 19821 bytes
word/DF/terms.json 530642 bytes, word/DF/0.json 19821 bytes
word/PR/terms.json 1963563 bytes, word/PR/0.json 58232 bytes
word/PB/terms.json 1789978 bytes, word/PB/0.json 5479 bytes
word/TX/terms.json 2855314 bytes, word/TX/0.json 72190 bytes
word/PO/terms.json 35979 bytes, word/PO/0.json 330 bytes
```

`test/regression/verify-remote.test.ts` exercises the streaming-hash and
range-comparison logic against a stubbed `fetch` and a small synthetic
buffer; it never touches the network, matching the rule that a Vitest test
never spawns a subprocess or makes a real request (the real bucket is
checked by running the script, not by a test).
