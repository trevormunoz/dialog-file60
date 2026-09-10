# What version 1 leaves out

Everything DIALOG documented for File 60 that this reconstruction does not
implement, and what it prints when you try it.

## What is not implemented

Out of scope for version 1: EXPAND and PAGE, the subfile limits
(`/CRIS`, `/HNRIMS`, `/ICAR`, `/CZARIS`, rejected by the same out-of-slice
guard as a suffix, never tested against the SF field), SELECT STEPS, DISPLAY
SETS, BEGIN's accounting block (the date/time/user line and the three `$`
cost lines -- BEGIN prints only the blank line, banner, blank line, and set
header), TYPE format 6 and user-defined formats from display codes (only
format 5 is implemented; every other format number or code list prints the
item header followed by `? /{format}`, and no record text), LOGOFF
accounting, the 1984 and 1988 fixtures, variant indexes, a database-owner
copyright line after the banner (`proto.begin.copyright_line`, status
`chosen` -- a different File's in-period BEGIN transcript shows one; File
60's is not held, so none is printed).

Word indexes and suffix search are implemented: `S PEACH/TI` and
`S PEACH/TI,DE` search the word indexes described in
[Word indexes](indexes.md).

OR and NOT are implemented, following the order of processing a later DIALOG
manual documents: without parentheses, NOT is worked out first, then AND,
then OR; parentheses change the order, innermost group first. `S CY=AMES OR
CY=BELTSVILLE AND ST=MARYLAND` and `S (CY=AMES OR CY=BELTSVILLE) AND
ST=MARYLAND` parse to different expressions. Proximity operators
((W), (N), and the rest) are not implemented; a SELECT using one is
indistinguishable from a typo, the same as before OR and NOT existed here.

A capability notice exists as a stub, not the full mechanism: EXPAND, PAGE,
DISPLAY SETS, LOGOFF, SORT, PRINT, KWIC, and TYPE by accession number
(`T 09143165/5`, distinct from the implemented `T S3/5/1-3` form) are
recognized by the parser as documented commands outside version 1's slice.
Recognizing one prints nothing into the character stream; one modern line
beneath the prompt reads "DIALOG documented `EXPAND` for File 60; this
reconstruction does not implement it yet." (registry `capability.notice`),
outside the stream entirely -- it never appears in scrollback or in a copied
selection, and it does not change the session. Every other out-of-slice
command or option -- proximity, right truncation, subfile limits
inside SELECT, multi-word implicit-adjacency terms, SELECT STEPS -- remains
indistinguishable from a typo and gets the simulated error form, `?`
followed by the offending token (an out-of-slice TYPE format prints the item
header first, as described above).

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
