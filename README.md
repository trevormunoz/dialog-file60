# DIALOG File 60 reconstruction

DIALOG File 60, "CRIS/USDA - Current Research", was an online database of USDA-funded research projects, searchable through the DIALOG service from at least 1984 until about 2000. This repository reconstructs it: it applies the search and display rules DIALOG documented for File 60 to the FY 1994 CRIS Format B export—the tape layout specified for loading CRIS into DIALOG, in which each record is a sequence of 80-column lines and each field begins with a two-letter tag—that the US National Archives holds, and serves the result as a browser terminal a reader can type commands into. The archival file is National Archives Identifier 1204533, https://catalog.archives.gov/id/1204533 (series 6207709, RG 164). The [evidence registry](#evidence-registry) gives the historical basis for each reconstructed behavior.

This reconstruction is not an emulation of DIALOG's software, nor of any mainframe, modem, or terminal. It is also not a claim that these particular records were in File 60: among the sources held for this reconstruction, nothing documents that these tapes went to DIALOG. The records are in the format DIALOG loaded File 60 from, and the rules for indexing and displaying that format are documented. The app lets a researcher search these records through the interface they were built for, and then trace how that interface shaped the representation, including the National Archives' own transformations on the way to the bytes now held.

## Evidence registry

`registry/evidence.json` is the project's register of historical claims. The registry gives each reconstructed behavior a key and marks it as one of three things:

* `documented` — a held source states the behavior;
* `inferred` — the behavior follows from surviving evidence that does not state it directly;
* `chosen` — the reconstruction needed to make a decision that the held historical evidence does not settle.

The app associates those keys with its output. A reader can inspect a printed line and see the evidence behind the rule that produced it rather than having to take the reconstructed interface at face value.

[docs/evidence.md](docs/evidence.md) lists the registry and explains how the statement and inspect panels expose it to a reader. When the prose in this README summarizes a historical behavior, the registry is the place to check the underlying claim and its sources.

## Status

The app currently implements the part of File 60 needed to conduct searches and inspect how their results were constructed.

The names below are DIALOG's own command names and display conventions. [docs/not-implemented.md](docs/not-implemented.md) explains both the implemented forms and the documented forms that this app leaves out.

Implemented commands and behaviors include:

* `BEGIN`;
* `SELECT`, including phrase-prefix searches, word-suffix searches, right truncation, `AND`, `OR`, `NOT`, parentheses, and the supported proximity operators `(W)`, `(N)`, `(F)`, `(nW)`, and `(nN)`;
* `SELECT STEPS`;
* `EXPAND` and `PAGE`, including use of displayed E-numbers in subsequent searches;
* `DISPLAY SETS`;
* `TYPE`, with formats 1, 5, 6, K (KWIC), and user-defined display-code formats;
* `SET KWIC`;
* `SORT`;
* `RANK`;
* `COMBINE`;
* `PRINT`;
* `LOGOFF` and its accounting block;
* the reconstruction statement and per-line inspect panel.

The implementation is deliberately narrower than the full documented DIALOG protocol. The app leaves some File 60 search forms, predefined display formats, proximity forms, subfile limits, and command variants unimplemented rather than approximating them. [docs/not-implemented.md](docs/not-implemented.md) defines those boundaries and explains what happens when a reader reaches one.

### A sample search

The acceptance session asks which FY 1994 records place a project at Beltsville with investigator F. A. Hammerschlag. `fixtures/acceptance-fy94.json`, independently derived from the corpus, checks the search counts and accession numbers.

```text
? s cy=beltsville
      S1     669  CY=BELTSVILLE

? s s1 and in=hammerschlag  f a
               2  IN=HAMMERSCHLAG  F A
      S2       2  S1 AND IN=HAMMERSCHLAG  F A

? t s2/5/1
```

The first item in S2 is accession number 9049442. The following is an excerpt from its format 5 rendering; the record continues beyond the lines shown here. `fixtures/fy94-9049442.format5.txt` pins this rendered output.

```text
 DIALOG(R)File  60:CRIS/USDA
 (c) format only 1998 The Dialog Corporation plc

 09049442
 PROJ NO: 1275-21000-008-00D   AGENCY : ARS 1275
 START: 01 AUG 87  TERM: 30 JUL 92              FY: 1992
 INVEST: HAMMERSCHLAG  F A
 INVEST: OWENS  L D
```

That record begins at byte 6,810,182 of the archival file. The acceptance run, its independently derived search results, and the checks back to the source bytes are documented in [`fixtures/ACCEPTANCE.md`](fixtures/ACCEPTANCE.md). Recorded reconstruction sessions are described in [Development](docs/development.md).

## Documentation

* [The reconstruction](docs/reconstruction.md) — what is being reconstructed, the anchor period, the sources held, the temporal limits, and the precedents followed.
* [Evidence](docs/evidence.md) — the evidence registry and how the on-screen panels expose its claims and sources.
* [Word indexes](docs/indexes.md) — which suffix codes are indexed, the tokenizer, the shard layout, the positional indexes, and the measured counts.
* [Hosting](docs/hosting.md) — the R2 bucket, its layout, CORS, and the deploy-time fixity check against the live copy.
* [What is not implemented](docs/not-implemented.md) — what version 1 leaves out of the documented protocol and what the reconstruction does instead.
* [Development](docs/development.md) — the file map, acceptance session, recordings, failure handling, archival tests, typechecking, and use of the reader package.
* [The Format B reader](packages/cris-formatb/README.md) — the package that reads the archival file, and a separate reading that checks each record against its documented rules.

## Failure handling

A failure in the app is never presented as though it were a DIALOG response.

Structural failures in the modern Format B reader, failures in an index or other required artifact, and failed byte-range reads belong to the app rather than to the historical interface. At runtime they therefore raise a modern notice outside the reconstructed character stream.

A mistyped or unrecognized command follows a different path: the reconstructed session treats it as a rejected DIALOG command and prints the simulated DIALOG `?` reply in the character stream.

When the Format B reader encounters malformed archival data that it can continue past, it keeps the data and adds a diagnostic rather than silently discarding it. The implementation details, diagnostic categories, and failure paths are documented under [Development](docs/development.md).

## Running it locally

```sh
pnpm install
```

The corpus file is not in this repository and is never committed. Obtain it first: `data/README.md` names the source and `scripts/extract-corpus.py` extracts and fixity-checks it into `data/RG164.CRIS.FY94.txt`. This is the only archival data file the running app loads. The FY 1988 export described in `data/README.md` supports an encoding profile in `packages/cris-formatb/src-ts/profiles.ts` but is not served by the application.

```sh
pnpm load     # build offsets, phrase indexes, and word indexes into public/corpus/
pnpm dev      # serve the app locally
pnpm test     # vitest
pnpm typecheck
```

The FY 1994 corpus is exactly 277,539,004 bytes. Archival tests exercise the real file rather than only committed fixtures. On a machine without the required corpus data, those tests fail loudly by default and name what is missing. Setting `CRIS_CORPUS_OPTIONAL=1` allows corpus-dependent archival tests to be skipped instead:

```sh
CRIS_CORPUS_OPTIONAL=1 pnpm test
```

## Project provenance

This reconstruction grew out of a larger project on the history of the Beltsville Agricultural Research Center, the "BARC story". That project prompted the attempt to recover CRIS as a historical research environment rather than treating the surviving export only as a flat dataset. The `barcstory` package scope and related deployment names come from that origin.

The BARC site is intended eventually to embed recorded sessions from this reconstruction. That integration is not live yet.

## Copyright and licence

Copyright Trevor Muñoz. No licence is granted yet; the code is published for reading. The archival data the app reads is a US federal record in the public domain; it is served from the bucket described in [Hosting](docs/hosting.md).

## AI Assistance

We developed this reconstruction using Anthropic's Claude as a generative coding tool, with human direction and review. We remain aware of the many critiques and concerns regarding generative AI and do not dismiss them.

**Process:** AI generated initial implementations, tests, and documentation from the sources listed under [Sources held](docs/reconstruction.md#sources-held). The human maintainer directed requirements, chose which sources count as evidence, reviewed all outputs, and takes full responsibility for the final code and for every historical claim. Those claims are kept separately from the implementation in the [evidence registry](#evidence-registry), where a reader can see whether a behavior is documented, inferred, or chosen and inspect the evidence attached to it.

**Acknowledgment:** AI capabilities derive partly from programmers whose public work became training data. Our output depends on proprietary AI infrastructure.

Following [Apache](https://www.apache.org/legal/generative-tooling.html) and [OpenInfra](https://openinfra.org/legal/ai-policy/) guidance, every commit notes the assistance in a `Co-Authored-By:` trailer naming the Claude model.
