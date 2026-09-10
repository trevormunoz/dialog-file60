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
