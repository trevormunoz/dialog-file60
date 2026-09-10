import type { Profile } from "@barcstory/cris-formatb";

// The tape chain and the source-file facts for each annual CRIS export the National Archives
// holds, whether or not this app serves it. Only FY 1994 is loaded and searched (spec section
// 12); FY 1988's entry backs a typed encoding profile (packages/cris-formatb/src/profiles.ts)
// that the reader can be parsed under, without its records being served.

export interface TapeProvenance {
  accession: string | null;
  transferMedia: string | null;
  transferBlocking: number | null;
  naraCopy: string | null;
  logicalRecordLength: 80;
  asciiConversion: { manifestPrepared: string; codePage: null };
  evidence: string[];
}

export interface SourceFileConfig {
  name: string;
  naid: string;
  bytes: number;
  sha256: string;
  acquisition: string;
  lineLength: 82;
  encoding: string;
  profile: Profile;
  tape: TapeProvenance;
}

const LATIN1_LINE = "80 columns + CRLF, read as Latin-1";

export const FY1994: SourceFileConfig = {
  name: "RG164.CRIS.FY94.txt",
  naid: "1204533",
  bytes: 277539004,
  sha256: "437af4e896e7186a2afa69e7d9cfdf8bd176388e731ee07b6cc27fb403d3807a",
  acquisition: "NARA series 6207709, NAID 1204533",
  lineLength: 82,
  encoding: LATIN1_LINE,
  profile: "fy1991plus",
  tape: {
    // No per-file validation statement is held for FY 1994; media facts are the FY 1991
    // statement's, applied by inference (nara.tape.fy1994_media).
    accession: null,
    transferMedia: "two 1/2-inch open reel, 9-track, 6250 bpi, EBCDIC, non-labeled (the FY 1991 file's media, applied to FY 1994 by inference)",
    transferBlocking: 15440,
    naraCopy: "a 3480 cartridge, EBCDIC, blocked 5040, OS standard labels (the FY 1991 file's copy, applied to FY 1994 by inference)",
    logicalRecordLength: 80,
    asciiConversion: { manifestPrepared: "2018-07-17", codePage: null },
    evidence: ["nara.conversion.line_form", "nara.conversion.control_bytes", "nara.tape.fy1994_media", "nara.tape.fy1994_accession"],
  },
};

/** Registry: nara.file.fy1988_fixity, nara.file.fy1988_header_record, nara.file.fy1988_trailer_record */
export const FY1988: SourceFileConfig = {
  name: "RG310.CRIS.FY88.txt",
  naid: "1204533",
  bytes: 258555594,
  sha256: "34c434343821d83728de08d9e786011d123f5413b115a5d6fb734e202e43c930",
  acquisition: "NARA series 6207709, NAID 1204533",
  lineLength: 82,
  encoding: LATIN1_LINE,
  profile: "fy1988",
  tape: {
    // The FY 1988 validation statement (nara-cris-packet) gives its own accession, unlike FY
    // 1994's. It is not transcribed here, so unlike FY 1994's transferMedia/naraCopy (an
    // inference this reconstruction registers and cites), FY 1988's physical tape media is
    // left unestablished rather than assumed to match a neighboring year without a registry
    // entry to back that claim.
    accession: "NN3-310-90-001",
    transferMedia: null,
    transferBlocking: null,
    naraCopy: null,
    logicalRecordLength: 80,
    asciiConversion: { manifestPrepared: "2018-07-17", codePage: null },
    evidence: ["nara.conversion.line_form", "nara.conversion.control_bytes", "nara.tape.fy1988_accession"],
  },
};
