# The reconstruction

The object this repository reconstructs, the period its rules are anchored
to, the sources held, the limits of what operating it can examine, and the
precedents it follows.

## What is being reconstructed

The National Archives holds six annual USDA Current Research Information
System (CRIS) data files, FY 1988 to 1994 (series 6207709, RG 164). They are
not CRIS's internal format. The FY 1991 validation statement says the agency
format "is difficult for users to work with" and "a COBOL program is
utilized to create the tapes in a more useable fashion". That fashion is the
CRIS/HNRIMS "DIALOG File Design Specifications, Format B" (CSRS, February
1990), the tape format from which DIALOG loaded its File 60, "CRIS/USDA -
Current Research". Format B itself records DIALOG-side processing: element UD
is "added by DIALOG at file loading".

Nothing documents that the tapes the National Archives holds were themselves
sent to DIALOG. The validation statement says the COBOL program "create[d]
the tapes" for the transfer, in the DIALOG file design; DIALOG received
monthly updates of about 400 records, the National Archives one annual tape.
The two chains share the Format B design and nothing else that is
documented:

```
CRIS internal  ->  COBOL export in Format B  ->  EBCDIC tape to NARA (annual)
                        |  same design; whether the same program or the same
                        |  records went to DIALOG is not documented (inferred)
                        +-> tape to DIALOG (monthly)  ->  DIALOG load  ->  File 60 online
                                                        (lost software)   (what searchers saw)

EBCDIC tape (2 reels, 9-track, 6250 bpi, blocked 15,440)
   ->  NARA 3480 cartridge copy (EBCDIC, blocked 5,040, OS labels)
   ->  NARA ASCII conversion: 82-byte lines, CRLF (manifest prepared 2018-07-17)
   ->  National Archives Catalog  ->  WACZ capture 2026-09-07
```

The object this project reconstructs is:

> the FY 1994 Format B export held by the National Archives, searched and
> displayed by the rules DIALOG documented for File 60.

## Anchor period

The rules applied are those documented for File 60 in the corpus period,
c. 1990 to 1994. Stated form:

> DIALOG File 60, CRIS/USDA - Current Research: its documented rules,
> anchored c. 1990 to 1994, from the February 1990 Format B specification
> and the March 2, 1998 Blue Sheet, applied to the FY 1994 export the
> National Archives holds.

The phrase "as these records would have been searched" is not used: the
records' presence in File 60 is inferred, not documented.

Reasons. The February 1990 Format B specification is the primary in-period
authority for field semantics and DIALOG search, display, and sort codes. The
1998 Blue Sheet is the only File 60 Blue Sheet known to survive and the authority
for DIALOG-side names, index types, output formats, and 1998 pricing; it
postdates the corpus by four to ten years, and by 1998 most corpus records
had been purged (terminated projects were "maintained in the file three to
four years"). The 1988 and 1994 screen evidence sits inside or at the edge
of the corpus period.

## Sources held

| Source | Date | Authority for |
|---|---|---|
| CRIS Format B specification, in the NARA CRIS documentation packet pp. 13-27, with its element table verified against the page images | Feb 1990 | tags, element meanings, repeat and presence rules, DIALOG search/display/sort codes |
| NARA FY 1991 validation statement, same packet pp. 28-29 | 1995 | meanings of SN and BP, which Format B lacks |
| File 60 Blue Sheet, raw HTML, Wayback 1998-04-23 | Mar 1998 | index types, suffix and prefix codes, limiting, sorting, formats, rates, sample record with display-code annotation |
| Dialog Database Catalog, OCR text | 1984 | CRIS on File 60, record count, update frequency |
| *DATABASE* magazine, April 1988, figures 1-5 (page images) | 1988 | BEGIN cost block, SS output, DS table, EXPAND table, TYPE item header, logoff accounting |
| Computer Chronicles broadcast, 512kb derivative, 14:09-15:40 | May 1984 | live screen: BEGIN block, dashed set header, per-term postings on SELECT, terminal chrome belongs to the PC program |
| *Curso Introductorio sobre el Sistema DIALOG* (ERIC ED374805), transparencies | 1994 | in-period fixed-pitch session: banner, SS with proximity, TYPE item header, format 5 record |
| Dialog Pocket Guide basic-commands page, Wayback 2001-07-09; *Successful Searching on Dialog* (2001), screens dated 1998 | 2001 | command syntax and definitions, later period |
| AGRICOLA User's Guide (NAL, 1984) | 1984 | command table incl. DISPLAY SETS, TYPE forms, for File 10 |
| ONTAP ERIC manuals (1978, 1981); DIALTWIG review (1987) | 1978-87 | period practice: answer-set testing, PC emulation precedent |
| FY 1994 and FY 1988 data files, extracted from the WACZ, fixity-checked | 1988, 1994 | measured encoding facts, tag counts, cardinalities |

Not held: any DIALOG-issued manual from 1985 to 1997, any File 60 search
transcript, any Blue Sheet before 1998, Chronolog 1985 to 1998, terminal
photographs, DIALOGLINK documentation, a Manual of Classification edition
between 1982 and the current one. Each is a statement of absence, "not found
by the named method on 2026-09-09", provisional.

**Rights in the sources.** The CRIS data files and the NARA documentation
packet are US federal records in the public domain. The one third-party
source reproduced in this repository is a transcription of the sample record
and its field table from the 1998 File 60 Blue Sheet
(`fixtures/bluesheet-sample-1998.txt`), a single record's worth of a page
DIALOG published to document the database, transcribed so that this
reconstruction's output can be compared against it line by line. It is held
here as a small excerpt for scholarly comparison and criticism, not as a
copy of the page, and the rest of the Blue Sheet is cited, not reproduced.
The 1988 magazine figures, the 1984 broadcast, the 1994 course transparencies
and the 2001 guides are cited by page or timestamp only.

## Temporal limits

**Bracket (documented).**

- On File 60 by 1984: the 1984 Dialog Database Catalog lists "CRIS/USDA
  (60)" with "31,200 records, monthly updates". Launch date: not found.
- Blue Sheet last updated March 2, 1998: 38,827 records, $0.25 per minute.
- Removed from Dialog's Blue Sheet documentation between 2000-03-04 (last
  index listing) and 2000-05-02 (first 404 of the File 60 page, while File
  10's page at the same path stayed live). Withdrawal from the live service
  is inferred from this, not documented.
- File 60 reassigned to ANTE by July 20, 2005.

Do not claim a launch date, an exact withdrawal date, or that behavior was
identical outside 1990 to 1998.

**What operating the reconstruction can and cannot examine.**

The historical proposition the reconstruction lets a user examine is: given
the export format and the documented File 60 rules, what did the DIALOG
representation add to, remove from, and rearrange in a CRIS record, and
which retrievals depend on those rules. It cannot examine what File 60
actually returned on a given day, because the corpus is an annual export
and the service changed monthly; it cannot examine pricing in the corpus
period, because only 1998 rates are held; and in version 1 it cannot
examine proximity searching, which was part of the documented protocol, so
any finding about "what could be found" is a finding under the reduced
operator set. Every behavior that originates in this implementation rather
than in a source is a registry entry with status `inferred` or `chosen`,
listed in one place in
[the registry listing](evidence.md#documented-inferred-chosen).

## Precedents

- The ELIZA MAD/SLIP reconstruction card (github rupertl/eliza-ctss,
  `RECONSTRUCTION-CARD.md`, January 2025), for the documented-versus-
  reconstructed register this project's registry follows.
- The Dartmouth DTSS emulator, for graded-fidelity language.
- The browser port of Adventure (github mmastrac/adventure), for
  prompt-response text with no terminal library.
- ONTAP (1978), for answer-set practice.
- DIALTWIG (1987), as a period DIALOG emulator built for teaching.
