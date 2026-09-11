# Evidence

The evidence registry, listed in full, and how the on-screen panels say the
same things in plain sentences.

## Documented, inferred, chosen

Every historical behavior in the code is a registry entry in
`registry/evidence.json`, keyed by `<area>.<name>`, carrying one of three
statuses: `documented` (a source states it, and the entry cites that
source), `inferred` (it follows from sources that do not state it), or
`chosen` (this reconstruction settled it). Each source carries its own
`sourceDate`, and that date is where a reader sees which period the entry
rests on. This is the full registry, grouped by status, produced by
`npx tsx scripts/registry-report.ts`:

```
## documented

- dialog.file60.title
- formatb.encoding.continuation_0xAC
- formatb.encoding.fy1988_sc_percent
- formatb.encoding.separator_0xA0_0x02
- formatb.record.separator
- index.word.stopwords
- map.AP
- map.AS
- map.AT
- map.BT
- map.CY
- map.DE
- map.DS
- map.DT
- map.FY
- map.GC.composite
- map.IC
- map.IN
- map.OB
- map.OC
- map.PB
- map.PC.composite
- map.PD
- map.PN
- map.PO.displays_PF_PI
- map.PP.display_from_PX
- map.PR
- map.PS
- map.PT
- map.RE
- map.RG
- map.RN
- map.SC.percent_from_SN
- map.SF
- map.ST
- map.TI
- map.TX.composite
- map.UP
- map.ZP
- nara.conversion.line_form
- nara.file.fy1988_fixity
- nara.file.fy1988_header_record
- nara.file.fy1988_trailer_record
- nara.file.fy1994_fixity
- nara.file.header_record
- nara.file.trailer_record
- nara.tape.fy1988_accession
- proto.accounting.prints
- proto.begin.set_header
- proto.begin.set_reset
- proto.combine.statement
- proto.displaysets.table
- proto.error.unmatched_parens
- proto.expand.enumbers
- proto.expand.page
- proto.expand.window
- proto.kwic.window
- proto.logoff.template
- proto.print.ack
- proto.prompt
- proto.prompt.spacing
- proto.select.boolean
- proto.select.echo_case
- proto.select.per_term_postings
- proto.select.precedence
- proto.select.setline
- proto.select.truncation
- proto.selectsteps.processing
- proto.selectsteps.sets
- proto.setkwic.ack
- proto.sort.command
- proto.sort.fields
- proto.sort.newset
- proto.type.item_header
- rates.file60_1998
- render.format1.layout
- render.format5.layout
- render.format6.labels
- render.setline.columns
- render.type.header
- render.userformat.codes

## inferred

- index.phrase.uppercase
- index.sh.phrase_only
- index.word.tokens
- map.AN.display_padding
- map.SC.row_alignment
- map.SX_TX.display_text
- nara.conversion.control_bytes
- nara.tape.fy1994_media
- proto.accounting.combination
- proto.begin.banner
- proto.expand.display
- proto.select.suffix
- render.headings.join
- render.text.justify
- terminal.cursorForm
- terminal.screen_rows
- terminal.width

## chosen

- capability.notice
- cast.pacing
- index.format
- index.word.hyphen
- index.word.shards
- inspect.mode
- nara.tape.fy1994_accession
- proto.begin.copyright_line
- proto.error.bad_file
- proto.error.bad_format
- proto.error.type_range
- proto.error.unknown_command
- proto.error.unknown_field
- proto.error.unknown_set
- proto.error.unknown_suffix
- proto.expand.collation
- proto.kwic.layout
- proto.print.no_artefact
- proto.session.clock
- proto.session.user_number
- proto.sort.multivalue_key
- render.format6.columns
- render.record.order
- terminal.backgroundColor
- terminal.display_mode
- terminal.keyboard_inspect
- terminal.line_editing
- terminal.pacing
- terminal.paper_delay
- terminal.paper_input_weight
- terminal.paper_sheet
- terminal.restart
- terminal.scrollback
- terminal.textColor
- terminal.width_rule
- terminal.wrap
```

## Reading the panels

The statement and inspect panels on screen speak in plain sentences, not in
this registry's vocabulary. A colored pill still marks each rule's status
with the one word above, but the word is followed, or can be read alongside,
an explanation:

- **documented** -- documented.
- **inferred** -- inferred from surviving examples.
- **chosen** -- chosen for this reconstruction.

**The statement panel.** It holds a heading, a paragraph saying what this is
and what it is not, one sentence pointing at `registry/evidence.json`, and a
closed "Integrity" block with the corpus file name, its SHA-256, the
software version, and the registry hash. It does not list the rules in
effect in the current session, and nothing in it changes as commands run:
the registry file is the one place the full list lives, and the inspect
panel is how a reader reaches the entry behind any one printed line. Nothing
is appended to copied text either.

Every card the inspect panel opens states its claim in a sentence first and
its registry key only as a small muted reference afterward, `[like.this]`,
for a reader who wants to find the entry in `registry/evidence.json` for
themselves. Source citations name a work a reader recognizes -- "DIALOG Blue
Sheet for File 60, 2 March 1998" -- not a repository file path; the mapping
from path to citation is `src/registry/words.ts`.

**Source glosses.** A reader may not know what a Blue Sheet, Format B, the
Curso, or a Computer Chronicles broadcast is. The inspect panel's "Why it
prints this way" card shows a one-sentence gloss under the first citation of
each source kind, `src/registry/words.ts`'s `sourceGloss()`:

- **Blue Sheet** -- DIALOG's one-page description of a database: its
  fields, search codes, and a sample record, as published by DIALOG.
- **1984 Dialog Database Catalog** -- DIALOG's 1984 catalog of the
  databases it offered, listing File 60 among them.
- **DIALOG pocket guide (2001)** -- DIALOG's quick-reference guide to
  basic search commands, published 9 July 2001.
- **The FY 1994 CRIS export** -- the archival file this reconstruction
  reads directly.
- **Format B specification** -- USDA's 1990 specification of the record
  layout CRIS exported for DIALOG.
- **ONTAP: ERIC training manual (1978, 1981)** -- a DIALOG training manual
  for the ERIC database, used to bracket search behaviour.
- **Successful Searching on Dialog (2001)** -- a later DIALOG searching
  manual, used only to bracket behaviour.
- **NARA validation statement** -- NARA's record of the tape it received
  and how it was copied and converted.
- **Curso Introductorio DIALOG (1994)** -- a Spanish-language DIALOG
  training course whose pages reproduce fixed-pitch session printouts.
- **DATABASE magazine reprint (1988)** -- figures from a
  searching-strategies article in DATABASE magazine, April 1988.
- **Computer Chronicles broadcast (1984)** -- a television demonstration
  of a DIALOG search on a PC, 21 May 1984.

**Data attribute names.** `src/terminal/sink.ts` stamps four attributes on
each scrollback line: `data-ordinal`, `data-tags`, `data-keys`, and
`data-value-index`. `data-ordinal` names a record's position in a search
set's ordinal list, not a Format B record id. One output line can carry
several source tags and several registry keys at once, so `data-tags` and
`data-keys` are plural. `data-value-index` says which value of a repeating
tag a composite grid row or an SC/SN row selects.

**Reader conveniences.** The inspect panel collapses to a narrow rail on the
right, by its own toggle button or the Alt+I chord that opens inspect (which
expands the panel if it was collapsed); hiding it changes nothing in the
session. A "Restart session" button and the Alt+R chord start over with an
empty prompt, an empty printout, and no open file -- in the period, the
closest equivalent was logging off and dialing in again; restart prints
nothing into the character stream, neither a LOGOFF block nor a new BEGIN
banner, since neither corresponds to any output this control actually
causes. A display-mode control and the Alt+S chord switch between printout
mode (every line persists and the pane scrolls -- the default) and screen
mode (only the last 24 lines are kept; older lines are removed from the DOM,
not merely hidden, so they cannot be scrolled to, selected, or copied).
Switching into screen mode discards everything above the last screenful;
switching back does not restore it.
