import type { SearchExpression } from "../retrieval/engine";

export type DialogCommand =
  | { cmd: "begin"; file: number }
  | { cmd: "select"; expr: SearchExpression; echo: string }
  /** SELECT STEPS (SS): the same expression as SELECT, but numbers a set for each operand
   * before the final combined set. */
  | { cmd: "selectsteps"; expr: SearchExpression; echo: string }
  | { cmd: "type"; set: number; format: string; items: number[] }
  /** SORT <Sn>/<items>/<ff>[,D][/<ff>[,D]...]: reorders the ordinals of set `set` by `keys`
   * into a new set. `items` is ALL or a range, as typed but unenforced -- see parser.ts's
   * comment on the branch that builds this. `echo` is the argument after the command word,
   * uppercased, for the new set's own "Sort <echo>" description. */
  | { cmd: "sort"; set: number; items: string; keys: { field: string; descending: boolean }[]; echo: string }
  /** EXPAND, with the raw text after the command word: `PREFIX=value`, `PREFIX=` alone, or a
   * bare term to browse the Basic Index. Unparsed here -- the session splits it. */
  | { cmd: "expand"; term: string }
  /** PAGE or P, and PAGE- or P- (`back`) to return to the page before the current one. */
  | { cmd: "page"; back: boolean }
  /** DISPLAY SETS (DS): reprints the set header and one line per set made since the last
   * BEGIN. `from`/`to` are null for the whole list, or the inclusive set-number range from a
   * bare (`DS 1-3`) or S-prefixed (`DS S1-S3`) form; a single set number leaves `to` equal to
   * `from`. */
  | { cmd: "displaysets"; from: number | null; to: number | null }
  /** LOGOFF: ends the session and prints the accounting block (spec 7.9). Takes no
   * argument -- unlike the capability-notice words below, it is implemented, not stubbed. */
  | { cmd: "logoff" }
  /** SET KWIC nn: sets the KWIC window size for the rest of the session (2001: "remains in
   * effect until LOGOFF"). `size` is already validated to 2..50 -- a value outside that range
   * does not reach this variant, it parses to { cmd: "unknown" } instead (proto.kwic.window). */
  | { cmd: "setkwic"; size: number }
  /** A command DIALOG documented for File 60 but outside this milestone's slice: PRINT and
   * TYPE by accession number. `command` names it
   * canonically (e.g. "LOGOFF"); `rest` is whatever followed the recognized command
   * word, unparsed. */
  | { cmd: "unsupported"; command: string; rest: string }
  | { cmd: "unknown"; text: string };
