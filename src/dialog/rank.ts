import { registry } from "../registry";
import { collate } from "../retrieval/engine-helpers";
import { WORD_CODES } from "../loader/words";

registry.get("proto.rank.command");
registry.get("proto.rank.display");
registry.get("proto.rank.columns");
registry.get("proto.rank.wordfields");

/** "Once a term is ranked, the top eight terms are automatically displayed" -- Successful
 * Searching on Dialog (2001), RANK -- corroborated by the 1994 Curso Introductorio DIALOG
 * worked example (proto.rank.display), whose own RANK Results block also stops at row 8. */
export const RANK_PAGE = 8;

export interface RankRow { rank: number; items: number; term: string }

/** Sorts a raw, unsorted [term, count] tally into ranked rows: descending by count, ties
 * broken by the index's own collation -- the same collate() SORT and EXPAND already apply.
 * No held source states DIALOG's own tie-break for RANK, so this is chosen, for consistency
 * with the collation this reconstruction already applies everywhere else a term list is
 * ordered (proto.rank.columns's note). */
export function rankTally(counts: [string, number][]): RankRow[] {
  return counts
    .slice()
    .sort((a, b) => b[1] - a[1] || collate(a[0], b[0]))
    .map(([term, items], i) => ({ rank: i + 1, items, term }));
}

/** True for a field code this build only carries in a word index, never a phrase index --
 * the case 2001's RANK restriction refuses ("does not work in any word-indexed fields").
 * Checked before RetrievalEngine.rankValues runs, so the word-field refusal
 * (proto.rank.wordfields) and the generic unknown-field refusal (proto.error.unknown_field)
 * -- the same simulated `? <FIELD>` text -- cite different registry keys for two different
 * reasons a field can fail to rank. */
export function isWordIndexedField(field: string): boolean {
  return WORD_CODES.includes(`/${field}`) || field === "PO";
}

export interface RankDisplayState { setId: number; itemsSearched: number; field: string; rows: RankRow[] }

/** The RANK Results block: header, count line, column header, and up to RANK_PAGE rows.
 * Content and line order read from Curso Introductorio DIALOG (1994) p.126, the anchor-period
 * source (proto.rank.display) -- "RANK Results", the "RANK: Sn/1-N  Field: FF=  File(s): nnn"
 * line and the "(N records - M terms)" count line are its own wording, File(s) fixed to 60
 * (the only file this reconstruction opens). The column header's single-line form and every
 * column's character width are this reconstruction's choice (proto.rank.columns), the same
 * rule Task 2 applied to format 6's typeset source: the 1994 page's own three-line stacked
 * header ("RANK  No.Items" / "No.   Ranked  Term" / dashes) is real observed content, but its
 * layout is the typesetter's, not DIALOG's, so it is not reproduced character-for-character. */
export function rankLines(state: RankDisplayState): string[] {
  const { setId, itemsSearched, field, rows } = state;
  const shown = rows.slice(0, RANK_PAGE);
  return [
    "RANK Results",
    "-------------",
    "",
    `RANK: S${setId}/1-${itemsSearched}  Field: ${field}=  File(s): 60`,
    `(${itemsSearched} records - ${rows.length} terms)`,
    "",
    "RANK  No. Items  Term",
    "",
    ...shown.map(r => `  ${String(r.rank).padEnd(7)}${String(r.items).padEnd(9)}${r.term}`),
  ];
}
