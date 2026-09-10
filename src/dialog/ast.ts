import type { SearchExpression } from "../retrieval/engine";

export type DialogCommand =
  | { cmd: "begin"; file: number }
  | { cmd: "select"; expr: SearchExpression; echo: string }
  | { cmd: "type"; set: number; format: string; items: number[] }
  /** A command DIALOG documented for File 60 but outside this milestone's slice: EXPAND,
   * PAGE, DISPLAY SETS, LOGOFF, SORT, PRINT, KWIC, and TYPE by accession number. `command`
   * names it canonically (e.g. "EXPAND", "DISPLAY SETS"); `rest` is whatever followed the
   * recognized command word, unparsed. */
  | { cmd: "unsupported"; command: string; rest: string }
  | { cmd: "unknown"; text: string };
