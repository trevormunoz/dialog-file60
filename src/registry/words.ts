// Vocabulary for the reader-facing panels. Pills keep the
// registry's one-word status class for styling (see index.html's .pill-<status> rules);
// statusWords supplies the sentence that explains what that one word means. sourceName
// supplies a citation a reader recognizes for a source the registry cites -- the registry
// carries only a short citation key, which is an identifier for the code to join on, never
// text shown in the statement or inspect panels.
import type { Status } from "./index";

const STATUS_WORDS: Record<Status, string> = {
  documented: "documented",
  inferred: "inferred from surviving examples",
  chosen: "chosen for this reconstruction",
};

export function statusWords(status: Status): string {
  return STATUS_WORDS[status];
}

// Every source citation key used anywhere in registry/evidence.json, mapped to a citation a
// reader recognizes. test/regression/words.test.ts scans the registry and asserts every
// cited key has an entry here, so a new source added to the registry without a citation
// fails loudly rather than printing a raw key in a reader-facing panel.
const SOURCE_NAMES: Record<string, string> = {
  "alin-1988": "Agricultural Libraries Information Notes, v.14 no.3, 1988, leaf 13",
  "dialog-catalog-1984": "Dialog Database Catalog, 1984",
  "agricola-guide-1984": "AGRICOLA User's Guide, National Agricultural Library, 1984",
  "bluesheet-1998-page": "DIALOG Blue Sheet for File 60, 2 March 1998",
  "bluesheet-1998-text": "DIALOG Blue Sheet for File 60, 2 March 1998",
  "pocket-guide-2001": "DIALOG Pocket Guide, basic commands, 9 July 2001",
  "cris-fy94-export": "the FY 1994 CRIS Format B export held by NARA, read directly",
  "format-b-1990": "CRIS Format B specification, February 1990",
  "ontap-eric-1978": "ONTAP: ERIC training manual, 1978",
  "ontap-eric-1981": "ONTAP: ERIC training manual, 2nd edition, 1981",
  "successful-searching-2001": "Successful Searching on Dialog, 2001",
  // These are two different NARA documents, not one. The packet is 210 pages (the FY 1988
  // and FY 1991 validation statements plus the Format B data-element descriptions); each
  // registry entry's own `locator` names the part it cites. The technical specifications
  // summary is the separate 2018 two-page manifest.
  "nara-cris-packet": "NARA CRIS documentation packet (validation statements and Format B element descriptions)",
  "nara-tss-2018": "NARA electronic-records technical specifications summary (manifest of files), 17 July 2018",
  "curso-1994": "Curso Introductorio DIALOG, 1994",
  "database-magazine-1988": "DATABASE magazine reprint, April 1988",
  "computer-chronicles-1984": "Computer Chronicles broadcast, 21 May 1984",
  "epa-session-1978": "EPA CIRH File 60 session transcript, 28 February 1978",
};

// The reverse of "every key the registry cites has a name here" -- every key named here is
// actually cited by some registry entry, so a source dropped from the registry does not leave
// an orphan citation behind. test/regression/words.test.ts's reverse check reads this.
export function knownSourceKeys(): string[] {
  return Object.keys(SOURCE_NAMES);
}

export function sourceName(key: string): string {
  const name = SOURCE_NAMES[key];
  if (!name) throw new Error(`no reader's citation for source key: ${key}`);
  return name;
}

// One plain sentence per source kind, for a reader who does not know what
// a Blue Sheet, Format B, the Curso, or a Computer Chronicles broadcast is. Two Blue Sheet
// keys (the page as published and its stripped text) and two NARA validation-statement keys
// share one sentence each -- they are the same document, cited from two forms; the two ONTAP ERIC
// manuals get their own sentences, one per edition, since the panel names the edition.
// Glosses are literal statements; no metaphor.
const SOURCE_GLOSSES: Record<string, string> = {
  "alin-1988":
    "One page of the National Agricultural Library's staff newsletter, costing out DIALOG printing at 1200 and 2400 baud.",
  "dialog-catalog-1984":
    "DIALOG's 1984 catalog of the databases it offered, listing File 60 among them.",
  "agricola-guide-1984":
    "The National Agricultural Library's 1984 guide to searching AGRICOLA on DIALOG, including the terminal speeds in common use.",
  "bluesheet-1998-page":
    "DIALOG's one-page description of a database: its fields, search codes, and a sample record, as published by DIALOG.",
  "bluesheet-1998-text":
    "DIALOG's one-page description of a database: its fields, search codes, and a sample record, as published by DIALOG.",
  "pocket-guide-2001":
    "DIALOG's quick-reference guide to basic search commands, published 9 July 2001.",
  "cris-fy94-export":
    "The FY 1994 CRIS export itself, the archival file this reconstruction reads directly.",
  "format-b-1990":
    "USDA's 1990 specification of the record layout CRIS exported for DIALOG.",
  "ontap-eric-1978":
    "A 1978 DIALOG training manual for the ERIC database, used to bracket search behaviour.",
  "ontap-eric-1981":
    "A 1981, second-edition DIALOG training manual for the ERIC database, used to bracket search behaviour.",
  "successful-searching-2001":
    "A later DIALOG searching manual, used only to bracket behaviour.",
  "nara-cris-packet":
    "A NARA packet: the FY 1988 and FY 1991 validation statements and the Format B field table, bound together.",
  "nara-tss-2018":
    "NARA's manifest of the CRIS data files: format, record length, and file names.",
  "curso-1994":
    "A 1994 Spanish-language DIALOG training course whose pages reproduce fixed-pitch session printouts.",
  "database-magazine-1988":
    "Figures from a searching-strategies article in DATABASE magazine, April 1988.",
  "computer-chronicles-1984":
    "A television demonstration of a DIALOG search on a PC, 21 May 1984.",
  "epa-session-1978":
    "A printed CIRH File 60 search session from 28 February 1978, the earliest File 60 session transcript held.",
};

/** A reader's one-sentence gloss for a source kind, keyed by the same key sourceName takes.
 * `undefined`, not a throw, for a key with no gloss yet -- panel.ts treats an unglossed
 * citation as one with nothing to show beneath it, never as an error; test/regression/
 * words.test.ts asserts every key the registry actually cites does have one. */
export function sourceGloss(key: string): string | undefined {
  return SOURCE_GLOSSES[key];
}
