# What version 1 leaves out

Everything DIALOG documented for File 60 that this reconstruction does not
implement, and what it prints when you try it.

## What is not implemented

Out of scope for version 1: the subfile limits
(`/CRIS`, `/HNRIMS`, `/ICAR`, `/CZARIS`, rejected by the same out-of-slice
guard as a suffix, never tested against the SF field), SET DETAIL ON (the
File column it adds to DISPLAY SETS' table is not printed), TYPE format 6
and user-defined formats from display codes (only format 5 is implemented;
every other format number or code list prints the item header followed by
`? /{format}`, and no record text), the 1984 and 1988 fixtures, variant
indexes, a database-owner copyright line after the banner
(`proto.begin.copyright_line`, status `chosen` -- a different File's
in-period BEGIN transcript shows one; File 60's is not held, so none is
printed).

Word indexes and suffix search are implemented: `S PEACH/TI` and
`S PEACH/TI,DE` search the word indexes described in
[Word indexes](indexes.md).

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

A capability notice exists as a stub, not the full mechanism:
SORT, PRINT, KWIC, and TYPE by accession number
(`T 09143165/5`, distinct from the implemented `T S3/5/1-3` form) are
recognized by the parser as documented commands outside version 1's slice.
Recognizing one prints nothing into the character stream; one modern line
beneath the prompt reads "DIALOG documented `SORT` for File 60; this
reconstruction does not implement it yet." (registry `capability.notice`),
outside the stream entirely -- it never appears in scrollback or in a copied
selection, and it does not change the session. Every other out-of-slice
command or option -- proximity, right truncation, subfile limits
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
Pricing never bills anything and can be switched off.

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
