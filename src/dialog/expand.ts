import { registry } from "../registry";

registry.get("proto.expand.display");
registry.get("proto.expand.window");
registry.get("proto.expand.collation");
registry.get("proto.expand.page");
registry.get("proto.expand.enumbers");

export const PAGE_ROWS = 12;
export const MAX_REF = 50;

/** Sentinel `code` for a bare EXPAND with no prefix: the merged Basic Index browse (the
 * union of the /TX, /TI, /DE and /PB word-term lists), rather than one phrase field's own
 * terms. Never a real DIALOG suffix or prefix, so it cannot collide with one. */
export const BASIC_INDEX = "*";

export interface ExpandRow { ref: number; items: number; term: string; starred: boolean; }
export interface ExpandState {
  code: string; terms: [string, number][]; entered: string | null; absent: boolean;
  enteredAt: number | null; start: number; nextRef: number; rows: ExpandRow[]; more: boolean;
}

/** Byte order of the uppercased keys (chosen). Statement of absence: no source states DIALOG's
 * collation -- not found by reading the EXPAND sections of the 1998 Blue Sheet, the 1988
 * figures, the 1994 Curso pages and the 2001 book on 2026-09-10. */
export const collate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The window's start, and where the entered term sits or would sit. The entered term is third
 * (2001: "usually third on the list"; 1988 figure 4 shows E3), so the window opens two rows
 * above it and is shifted, never padded, at either end of the index. */
export function expandWindow(terms: [string, number][], entered: string): { start: number; enteredAt: number; absent: boolean } {
  let at = terms.findIndex(([t]) => collate(t, entered) >= 0);
  if (at < 0) at = terms.length;
  const absent = terms[at]?.[0] !== entered;
  const length = terms.length + (absent ? 1 : 0);
  const start = Math.max(0, Math.min(at - 2, Math.max(0, length - PAGE_ROWS)));
  return { start, enteredAt: at, absent };
}

/** One page of rows. `entered` is null on a PAGE or PAGE- (2001: after PAGE-, "the original
 * EXPAND entry is no longer asterisked"), so no row is starred. E numbers run to E50 and
 * restart at E1. */
export function expandPage(args: {
  terms: [string, number][]; start: number; firstRef: number;
  entered: string | null; enteredAt: number | null; absent: boolean; code: string;
}): ExpandState {
  const { terms, start, firstRef, entered, enteredAt, absent, code } = args;
  const view: [string, number][] = absent && entered !== null && enteredAt !== null
    ? [...terms.slice(0, enteredAt), [entered, 0], ...terms.slice(enteredAt)]
    : terms;
  const rows: ExpandRow[] = [];
  for (let i = 0; i < PAGE_ROWS && start + i < view.length; i++) {
    const [term, items] = view[start + i]!;
    rows.push({ ref: ((firstRef - 1 + i) % MAX_REF) + 1, items, term, starred: entered !== null && term === entered });
  }
  return {
    code, terms, entered, absent, enteredAt,
    start: start + rows.length,
    nextRef: ((firstRef - 1 + rows.length) % MAX_REF) + 1,
    rows, more: start + rows.length < view.length,
  };
}

/** Ref from column 1, items right-aligned ending at column 11, two spaces, then the term with
 * an asterisk immediately before it when it is the entered one (spec 7.3's transcribed block). */
export function expandLines(state: ExpandState): string[] {
  const out = ["Ref   Items  Index-term"];
  for (const r of state.rows) {
    const ref = `E${r.ref}`.padEnd(4);
    const items = String(r.items).padStart(7);
    out.push(`${ref}${items}  ${r.starred ? "*" : ""}${r.term}`);
  }
  if (state.more) out.push("          Enter P or PAGE for more");
  return out;
}
