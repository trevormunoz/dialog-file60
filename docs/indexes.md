# Word indexes

`pnpm load` builds a word index for every DIALOG suffix code the corpus
supports a free-text search over: `/TI /OB /AP /DE /PR /PB /TX PO=`.
`/DF` is the Blue Sheet's documented alias of `/DE`; the engine resolves it
to `/DE`'s index at query time (`src/retrieval/engine.ts`), so no `/DF`
directory is built. `PO=` is the word half of the Performing
Organization fields (PF, PI) -- the phrase half is the phrase index. `/TX`
is the Blue Sheet's documented union of `/AP`, `/NR`, `/OB` and `/PR`
(footnote 6); this corpus's HNRIMS narrative tag (`/NR`'s source) has a
measured count of 0, so `/TX` is built here as `AP + OB + PR`
(`map.TX.composite`). `SH=` is built as a phrase index only, following the
Format B "Word and Phrase" reading for PH/GH (`index.sh.phrase_only`, a
recorded disagreement with the Blue Sheet, not a silent choice).

**Tokenizer** (`src/loader/words.ts`, `index.word.tokens`). Text is
uppercased and split on spaces and on punctuation other than the hyphen;
digits are their own tokens; a hyphenated token (`GENE-TRANSFER`) is
indexed whole and as each of its parts (`index.word.hyphen`, chosen: no
source states whether DIALOG itself did this). The nine Dialog stop words
(`index.word.stopwords`, documented at 2001, inferred for 1994) -- AN, BY,
FROM, THE, WITH, AND, FOR, OF, TO -- are dropped. A posting counts a
record once, never once per occurrence within it.

**Sharding** (`index.word.shards`, chosen: DIALOG's own index shape is not
known). Each code's term list is split into one file per first character --
A-Z, 0-9, and `_` for anything else -- so a browser search loads only the
shard it needs rather than the whole code's term list. Layout:
`public/corpus/word/<CODE>/terms.json` (every term in the code, paired with
its postings count, sorted by byte order of the uppercased key) and
`public/corpus/word/<CODE>/<SHARD>.json` (that shard's terms, each mapped
to its postings array).

**Merged Basic Index** (`public/corpus/word/_merged/terms.json`). A bare
EXPAND with no suffix browses the union of `/TX`, `/TI`, `/DE` and `/PB`,
each term paired with the true union count of its postings across the four
codes. The loader builds this file once, so the browser never loads every
shard of all four codes for that browse.

**Measured** (2026-09-10, `pnpm load` against the full 277,539,004-byte
corpus, 34,090 records):

```
code   distinct terms   on-disk bytes (code directory)
/TI          20,290           2,048,108
/OB          57,726           8,156,089
/AP          77,359          12,626,616
/DE          26,642           7,012,021
/PR         121,805          19,661,310
/PB         116,488           9,902,275
/TX         171,907          33,073,403
PO=           2,638           1,019,013
total                        93,498,835
```

Independent magnitude check (a separate script tokenizing each word-indexed
Format B tag directly, dropping no stop words, and not grouping tags into
suffix codes): `records 34090`, word-field text bytes `86,808,306`, distinct
tokens AP 106,628; DE 64,918; OB 80,842; PB 144,939; PF 1,326; PI 1,680; PR
166,045; TI 25,856; union of all eight tags 353,644. The loader's own
per-code counts run lower than the independent check's per-tag counts (stop
words dropped) and `/TX`'s count is higher than any one of its three
component tags (it is their union) -- the check confirms magnitude, not
equality, and both runs agree records = 34,090.

**Report.** `public/corpus/report.json` (not uploaded, see
[Hosting](hosting.md)) carries `wordTerms` and `wordPostings`, the per-code
counts above, recorded by the loader rather than read back out of file sizes.

## Positional index

Beside each word index, the loader writes a positional index recording where
each indexed word sits within its field: which record, which field ordinal
(the field's index among that code's occurrences in the record -- so two
values of a repeating tag, or a composite code's second component tag, are
two field ordinals, never one), and the word's 0-based position within that
field's text (`index.word.positions`, chosen -- no held source states how
DIALOG itself stored or counted word positions). A packed position is
`fieldOrdinal * FIELD_STRIDE + wordPosition`, one integer per occurrence
rather than a two-element array. Positions are counted over *every*
whitespace-separated word of a field, including the nine stop words --
unlike the word-index tokenizer above, which drops them before indexing --
so "adjacent in the text" survives a dropped stop word: `FRESH WATER` and
`FRESH THE WATER` must not both look adjacent. A hyphenated token posts its
whole form and each part at the same packed position, following the word
index's own hyphen rule (`index.word.hyphen`): a proximity operator must
see one position for `GENE-TRANSFER`'s occurrence, not three.

**`FIELD_STRIDE`**, measured rather than guessed: the longest of the
TI/OB/AP/PR/DE/PB fields across the FY 1994 corpus, in whitespace-separated
words including stop words, is 296 (measured 2026-09-11 by the python script
recorded at `index.word.positions`). `FIELD_STRIDE` is the next power of two
above that, 512.

**Layout.** `public/corpus/pos/<CODE>/<SHARD>.json`, the same first-character
sharding as the word index; no `terms.json` counterpart, since nothing
browses a positional index directly.

**Decision (a): which codes ship.** `buildIndexes()`'s third argument names
which codes it actually computes positions for (`src/loader/index-builder.ts`);
it defaults to `POSITIONAL_CODES` (`src/loader/words.ts`). A one-time run
passing every `WORD_CODES` entry measured the full eight-code positional
index at well over this reconstruction's 150 MB ceiling on bytes added to
the bucket's `v1/` prefix (table below). Per Trevor's pre-approved rule,
`src/loader/cli.ts` computes, writes and `scripts/upload-corpus.sh` uploads
positions for only the two Basic Index codes, `/TI` and `/DE`
(`POSITIONAL_CODES`). `/TX`, `/AP`, `/OB`, `/PR`, `/PB` and `PO=` carry no
positional index; proximity over them is recorded as not implemented
([What version 1 leaves out](not-implemented.md)), with this measurement as
the stated reason. (Computing all eight unconditionally on every call, the
first version of this loader, also pushed several archival tests that build
fresh over the real corpus past Vitest's 60 s per-file RPC timeout --
`buildIndexes()`'s default keeps normal test and build runs cheap.)

**Measured, full eight-code set** (2026-09-11, one-time `pnpm load` run with
`buildIndexes()`'s third argument forced to every `WORD_CODES` entry,
against the full 277,539,004-byte corpus, 34,090 records -- the measurement
that decided (a); not what a normal `pnpm load` computes):

```
code   occurrences   on-disk bytes (computed, all codes)
/TI       253,982        3,258,188
/OB     1,380,885       15,624,681
/AP     2,374,933       25,651,311
/DE     1,214,193       13,625,789
/PR     4,161,495       43,133,386
/PB     1,794,984       18,495,289
/TX     7,917,313       83,279,393
PO=       169,491        2,173,628
total  19,267,276      205,241,665
```

That run's build cost (`/usr/bin/time -l pnpm load`, whole loader run
including phrase indexes, word indexes and the positional computation
above): 56.53 s real (78.51 s user, 1.37 s sys), 4,928,765,952 bytes
(4.93 GB) maximum resident set size.

**Measured, shipped subset** (2026-09-11, normal `pnpm load` -- the default
`POSITIONAL_CODES` argument, what actually reaches disk and the bucket):
`/TI` + `/DE` = 1,468,175 occurrences, 16,883,977 bytes of JSON content,
16 MB on disk (`du -sh public/corpus/pos`, block-rounded), 74 files
(`find public/corpus/pos -name '*.json' | wc -l`) -- comfortably under the
150 MB ceiling. Build cost, whole loader run: 18.50 s real (19.36 s user,
0.54 s sys), 2,035,318,784 bytes (2.04 GB) maximum resident set size.

**Report.** `public/corpus/report.json` (not uploaded) carries
`posPostings` and `posBytes` per code from whatever codes the run actually
computed -- 0 for a code `buildIndexes()` was not asked to build positions
for, on a normal run every code but `/TI` and `/DE` -- recorded by the
loader rather than read back out of file sizes.
