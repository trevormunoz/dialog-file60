# What version 1 leaves out

Everything DIALOG documented for File 60 that this reconstruction does not
implement, and what it prints when you try it.

## What is not implemented

Out of scope for version 1: the subfile limits
(`/CRIS`, `/HNRIMS`, `/ICAR`, `/CZARIS`, rejected by the same out-of-slice
guard as a suffix, never tested against the SF field), SET DETAIL ON (the
File column it adds to DISPLAY SETS' table is not printed), RANK (the
relevance-ranking display over a set), the 1984 and 1988 fixtures,
variant indexes, a database-owner copyright line after the banner
(`proto.begin.copyright_line`, status `chosen` -- a different File's
in-period BEGIN transcript shows one; File 60's is not held, so none is
printed).

Format 1 (DIALOG Accession Number), format 5 (Full Record), format 6
(Heading and Title), format K (KWIC, Key Word In Context), and
user-defined formats built from display codes (`T S3/IN,OB/1-5`) are
implemented (`src/dialog/formats.ts`, `src/dialog/kwic.ts`). Ten other
predefined formats the Blue Sheet names are not, each for the same reason --
its field set is documented, its layout is not: format 2 (Heading, Title,
Keywords, Primary Headings, and Subfile Notation / Classification and Headings),
format 3 (Heading, Title, Objectives, Primary Headings, and Subfile
Notation / Classification and Headings), format 4 (Full Record with Tagged
Fields), format 7 (Heading, Title, Text, and Publications), format 8
(Heading, Title, Objectives, and Publications), format 9 (Full Record),
format 10 (Mailing Labels (Address of Performing Organization)), format 12
(Full Format for HNRIMS Records), format 13 (Heading, Title, and
Classification Codes and Headings), and format 14 (Heading, Title,
Classification Codes, Text, Keywords, and Publications). Each of these
prints the item header followed by `? /{format}`, and no record text.

KWIC (format K) and SET KWIC nn are implemented for the window mechanics
the 2001 manual states: the window is a run of words, `nn` words wide
(`SET KWIC nn`, 2 to 50, 30 by default), centred on the matched word and
shifted rather than padded at a text edge, with a space before the ellipsis
(` ...`) on each side the window is cut. `SET KWIC 14` answers `KWIC is set
to 14.`, the manual's own worked example, and the setting remains in effect
until LOGOFF. What is *not* implemented, because no held source shows it:
the arrangement of windows inside one KWIC record -- what precedes each
window, how multiple windows in one record are separated, whether a field
label appears. No held source shows a rendered KWIC block, for File 60 or
for any file -- not found by grepping `KWIC` across the 2001 manual text and
the stripped 1998 Blue Sheet text, and by reading the 1988 *DATABASE*
figures and the 1978 File 60 session, on 2026-09-10 (`proto.kwic.layout`,
status `chosen`). This reconstruction prints one window per line, in field
order, with no field label, header, or separator beyond the item header
TYPE already prints -- a choice, not a reading of any source. HILIGHT,
named alongside KWIC in the same Blue Sheet line ("KWIC and HILIGHT
Available"), is documented for File 60 and not implemented at all. KWIC
combined with another format in one TYPE (`T S2/5,K/1`), which the Blue
Sheet's row K says is possible, is also not implemented -- this task's
format dispatch only recognizes `K` alone.

Word indexes and suffix search are implemented: `S PEACH/TI` and
`S PEACH/TI,DE` search the word indexes described in
[Word indexes](indexes.md).

Right truncation (`?`) is implemented as a prefix scan over the sorted term lists: a single
trailing `?` on a word, with or without a suffix list (`OYSTER?`, `TECHNOLOG?/TI`), finds every
term that starts with the text before the `?` and unions their postings on one line, the same
form the 2001 manual's worked example prints (`?select forecast?` -> `S1 16106 FORECAST?`) and
the 1978 File 60 session prints (`SELECT LOBSTER?` -> `3 14 LOBSTER?`). No held source documents
any other truncation form for File 60: the bounded (`word??`), spaced (`word? ?`) and internal
(`wo?rd`) forms are refused rather than read as a single `?`, a statement of absence (not found
by grepping `truncat`, `??` and `? ?` across the 2001 manual text and the stripped 1998 Blue
Sheet text on 2026-09-10). `PREFIX=value?` truncation is a different, real File 60 form -- the
1998 Blue Sheet documents it (`S PO=OHIO STATE UNIV?`) -- and is not implemented here, since
this task's operand grammar has no `PREFIX=` truncation form.

EXPAND and PAGE are implemented: `E IN=SNOOK` browses the IN index a
twelve-row page at a time, with the entered term usually third and starred;
`E` with only a prefix code (`E DS=`) starts at the head of that index; a
bare term (`E PEACH`) browses the merged Basic Index instead of one field.
`P` or `PAGE` shows the next page, `P-` or `PAGE-` returns to the page
before it. A row's ref number (`E3`, or a range `E3:E5`) can be used as a
SELECT operand once its EXPAND display is open.

OR and NOT are implemented, following the order of processing a later DIALOG
manual documents: without parentheses, NOT is worked out first, then AND,
then OR; parentheses change the order, innermost group first. `S CY=AMES OR
CY=BELTSVILLE AND ST=MARYLAND` and `S (CY=AMES OR CY=BELTSVILLE) AND
ST=MARYLAND` parse to different expressions. Proximity operators
((W), (N), and the rest) are not implemented; a SELECT using one is
indistinguishable from a typo, the same as before OR and NOT existed here.

SELECT STEPS (`SS`, or `SELECT STEPS`) is implemented: it prints `Processing`,
then a numbered set for each operand of the search, then the combined set,
the same expression grammar as SELECT. `SS CY=BELTSVILLE AND
IN=HAMMERSCHLAG` numbers S1 for CY=BELTSVILLE, S2 for IN=HAMMERSCHLAG, and S3
for the combined search; a single-operand SS numbers one set, not the same
line twice.

DISPLAY SETS (`DS`, or `DISPLAY SETS`) is implemented: it reprints the set
header and one line per set made since the session's last BEGIN, the same
set-line layout SELECT and SELECT STEPS use. `DS` alone shows every set;
`DS 1-3` or `DS S1-S3` shows a range, and a single number shows one set. `DS`
before any SELECT shows the header alone, and BEGIN clears the list.

SORT is implemented: `SORT <Sn>/<items>/<ff> <,D>` builds a new set holding
the source set's records reordered by one or more field codes, each
optionally reversed with a comma and `D` (`SORT S1/ALL/SA,D/ST` sorts SA
descending, then ST ascending). `<items>` is parsed (`ALL` or a range) but
not enforced -- every SORT reorders the whole source set regardless, the
same way the 2001 manual's own note ("For correct results, you must sort
ALL items in a set") only warns about a subset sort rather than describing
what one does. The new set's description is the literal string `Sort `
followed by the command's own argument uppercased, reproducing the source's
own mixed case rather than normalizing it. The Blue Sheet's Sorting section
lists nineteen sortable field codes; a sort on one this FY 1994 CRIS-only
export carries no value for (`AG`, `AI`, `AT`, `CG`, `ID`, `SP`) succeeds
with every record's key empty, not an error -- naming a field outside that
nineteen-code list (`SORT S1/ALL/OB`) is refused with the simulated `?
<FIELD>` error instead. SORT does not implement the `FROM <file>` option
(part of OneSearch, out of scope here) or sorting as part of a PRINT command
-- the Blue Sheet's own `PRINT S5/5/ZP` and the 1978 File 60 session's
`PRINT 16/5/1-35/AS/PN` both carry sort codes on PRINT itself, which is a
later task's subject, not this one's.

COMBINE is implemented, in the two forms the 28 February 1978 File 60
session shows (EPA *Chemical Information Resources Handbook*, January
1981, pp. 184-185): `COMBINE <a>-<b>/<OP>`, folding a range of set numbers
left-associatively into AND, OR or NOT (`COMBINE 1-7/OR`), and
`COMBINE <expr>`, the same parentheses/AND/OR/NOT grammar SELECT uses,
over bare set numbers -- no `S` prefix, the one syntax difference from a
SELECT operand naming a set. COMBINE prints only its own set line, never a
per-term breakdown, even for a multi-operand statement, and that line's
description is the statement exactly as typed after the command word,
uppercased -- all three read directly off the 1978 transcript's four
COMBINE statements and their set lines. This is **pre-anchor** evidence:
the 1978 session is twelve years before this reconstruction's 1990-1994
anchor, and it is the only source in the collection that shows COMBINE at
all -- no anchor-period source shows it, and the 2001 manual carries no
COMBINE entry, a statement of absence (not found by grepping `COMBINE`
across the 2001 manual text, the stripped 1998 Blue Sheet text and the
extracted 1988 *DATABASE* figures on 2026-09-10). The range form's `/OP` is
shown only as `/OR`; `/AND` and `/NOT` are accepted and left-associative
here rather than refused, since refusing them would be a rule this
reconstruction invented, not one the source states. A COMBINE naming a set
number that does not exist prints the simulated `?` error with the bare
number as typed (`COMBINE 1-2/OR` with no set 1 prints `? 1`), not
SELECT's `? S<n>` form -- no source records COMBINE's own error text
either.

A capability notice exists as a stub, not the full mechanism:
PRINT and TYPE by accession number
(`T 09143165/5`, distinct from the implemented `T S3/5/1-3` form) are
recognized by the parser as documented commands outside version 1's slice.
Recognizing one prints nothing into the character stream; one modern line
beneath the prompt reads "DIALOG documented `PRINT` for File 60; this
reconstruction does not implement it yet." (registry `capability.notice`),
outside the stream entirely -- it never appears in scrollback or in a copied
selection, and it does not change the session. Every other out-of-slice
command or option -- proximity, `PREFIX=value?` truncation, subfile limits
inside SELECT, multi-word implicit-adjacency terms -- remains
indistinguishable from a typo and gets the simulated error form, `?`
followed by the offending token (an out-of-slice TYPE format prints the item
header first, as described above).

LOGOFF is implemented: it ends the session and prints the accounting block
-- a date/time/user line, connect time at $0.25 a minute, one line per TYPE
format actually used, and the estimated total, twice (per file and for the
search, equal in this single-file slice). The same date/time/user line
opens BEGIN. The 1978 File 60 session and 1988 figure 5 document the
block's shape; the 1998 Blue Sheet's rate card prices it -- combining the
two is inferred, since no single held source gives both for the same year.
No rate card from 1990-1994 is held: a statement of absence, not found in
`dataset-cards/research/cris-dialog/sources/` by the review of 2026-09-09.
Pricing never bills anything and can be switched off. A real DIALOG
accounting block's Descriptors and Prints lines -- added when a session
displayed thesaurus descriptors or used PRINT -- are not implemented; only
the connect-time and TYPE-format lines print.

The 1998 Blue Sheet documents 30 Additional Index (phrase-indexed) prefixes
for File 60. Version 1 builds a phrase index for every one of them except
SP: its Format B tag is HNRIMS-only and has a measured count of 0 on this
CRIS-only corpus (the same reason `PO='s` word index comment in
`src/loader/words.ts` gives for not building SP there either). A SELECT
naming SP routes to the same capability-notice channel as EXPAND: `S
SP=USDA-CSRS` prints nothing into the character stream and shows "DIALOG
documented `SP= (search prefix)` for File 60; this reconstruction does not
implement it yet." beneath the prompt. A field the Blue Sheet does not
document at all (e.g. `S ZZ=X`) still gets the simulated typo error.

OneSearch, DIALOG's cross-file search product, is not reconstructed: this
repository opens one file, 60, and nothing else. Of the six annual CRIS/USDA
data files the National Archives holds (FY 1988 to FY 1994), only FY 1994's
is loaded into the running app; FY 1988's measured encoding facts back a
typed corpus profile (see [Word indexes](indexes.md)) but its own records are
not served. The other four years, FY 1989 to FY 1992, have no profile and no
loaded data.
