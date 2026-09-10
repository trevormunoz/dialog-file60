# DIALOG File 60 reconstruction

DIALOG File 60, "CRIS/USDA - Current Research", was an online database of
USDA-funded research projects, searchable through the DIALOG service from at
least 1984 until about 2000. This repository reconstructs it: it applies the
search and display rules DIALOG documented for File 60 to the FY 1994 CRIS
Format B export that the US National Archives holds, and serves the result
as a browser terminal a reader can type commands into. The archival file is
National Archives Identifier 1204533,
<https://catalog.archives.gov/id/1204533> (series 6207709, RG 164). Every
historical behaviour in the code is recorded in `registry/evidence.json` as
documented, inferred, or chosen, and the interface lets a reader open any
printed line and see which.

It is not an emulation of DIALOG's software, which does not survive, nor of
any mainframe, modem, or terminal. It is also not a claim that these
particular records were in File 60: the National Archives holds an annual
export in the format DIALOG loaded File 60 from, and nothing documents that
these tapes went to DIALOG. What can be said is that the records are in that
format and that the rules for indexing and displaying that format are
documented. The reconstruction lets a researcher search these records
through the interface they were built for, and then dismantle that interface
to see how the representation was made, including the National Archives' own
transformations on the way to the bytes now held.

It is one part of a larger project on the history of the Beltsville
Agricultural Research Center, the "BARC story", whose site embeds the
recorded session described under Development. The `barcstory` name in the
package scope, the bucket, and the site's URL base comes from that project.

## Running it locally

```
pnpm install
```

The corpus file is not in this repository and is never committed. Obtain it
first: `data/README.md` names the source and `scripts/extract-corpus.py`
extracts and fixity-checks it into `data/RG164.CRIS.FY94.txt`.

```
pnpm load     # build the offsets, phrase indexes, and word indexes into public/corpus/
pnpm dev      # serve the app on localhost
pnpm test     # vitest
pnpm typecheck
```

`pnpm test` includes archival tests that read the real 277 MB corpus file.
Without that file they fail loudly, naming the missing file and the
extraction script, rather than skipping silently. Set
`CRIS_CORPUS_OPTIONAL=1` to skip them instead
(`CRIS_CORPUS_OPTIONAL=1 pnpm test`).

## Documentation

- [The reconstruction](docs/reconstruction.md) -- what is being reconstructed, the anchor period, the sources held, the temporal limits, and the precedents followed.
- [Evidence](docs/evidence.md) -- the full registry listing by status, and how the on-screen panels say the same things in plain sentences.
- [Word indexes](docs/indexes.md) -- which suffix codes are indexed, the tokenizer, the shard layout, and the measured counts.
- [Hosting](docs/hosting.md) -- the R2 bucket, its layout, CORS, and the deploy-time fixity check against the live copy.
- [What is not implemented](docs/not-implemented.md) -- what version 1 leaves out of the documented protocol, and what it prints instead.
- [Development](docs/development.md) -- the file map, the acceptance session and its recording, archival tests, typechecking, and using the reader package.

## Status

Implemented: `BEGIN`; `SELECT` with `AND`, `OR` and `NOT`, the documented
phrase prefixes this corpus carries, and word-suffix search over
`/TI /OB /AP /DE /DF /PR /PB /TX PO=`; `SELECT STEPS`; `EXPAND` and `PAGE`;
`DISPLAY SETS`; `TYPE` format 5; `LOGOFF` and its accounting block; and the
inspect and statement panels.

Everything else DIALOG documented for File 60 is listed in
[docs/not-implemented.md](docs/not-implemented.md), with what the
reconstruction prints when you try it.

## Copyright and licence

Copyright Trevor Muñoz. No licence is granted yet; the code is published for
reading. The archival data the app reads is a US federal record in the
public domain; it is served from the bucket named in
[Hosting](docs/hosting.md).

## AI Assistance

We developed this reconstruction using Anthropic's Claude as a generative
coding tool, with human direction and review. We remain aware of the many
critiques and concerns regarding generative AI and do not dismiss them.

**Process:** AI generated initial implementations, tests, and documentation
from the sources listed under [Sources held](docs/reconstruction.md#sources-held).
The human maintainer directed requirements, chose which sources count as evidence, reviewed all
outputs, and takes full responsibility for the final code and for every
historical claim. Those claims are held separately from the code: the
evidence registry records, for each historical behaviour, whether a source
documents it, whether it is inferred from sources that do not state it, or
whether this reconstruction chose it. The registry is what a reader should
check, not the prose.

**Acknowledgment:** AI capabilities derive partly from programmers whose
public work became training data. Our output depends on proprietary AI
infrastructure.

Following [Apache](https://www.apache.org/legal/generative-tooling.html) and
[OpenInfra](https://openinfra.org/legal/ai-policy/) guidance, every commit
records the assistance in a `Co-Authored-By:` trailer naming the Claude
model.
