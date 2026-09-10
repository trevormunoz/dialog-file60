import type { SearchExpression } from "../retrieval/engine";

export type DialogCommand =
  | { cmd: "begin"; file: number }
  | { cmd: "select"; expr: SearchExpression; echo: string }
  | { cmd: "type"; set: number; format: string; items: number[] }
  /** EXPAND, with the raw text after the command word: `PREFIX=value`, `PREFIX=` alone, or a
   * bare term to browse the Basic Index. Unparsed here -- the session splits it. */
  | { cmd: "expand"; term: string }
  /** PAGE or P, and PAGE- or P- (`back`) to return to the page before the current one. */
  | { cmd: "page"; back: boolean }
  /** A command DIALOG documented for File 60 but outside this milestone's slice: DISPLAY
   * SETS, LOGOFF, SORT, PRINT, KWIC, and TYPE by accession number. `command` names it
   * canonically (e.g. "DISPLAY SETS"); `rest` is whatever followed the recognized command
   * word, unparsed. */
  | { cmd: "unsupported"; command: string; rest: string }
  | { cmd: "unknown"; text: string };
