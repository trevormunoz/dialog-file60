import type { Profile } from "@barcstory/cris-formatb";
import { registry } from "../registry";
import type { Fixity } from "../loader/fixity";

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
  asciiConversion: { manifestPrepared: string | null; codePage: null };
  evidence: string[];
}

export interface SourceFileConfig {
  name: string;
  naid: string | null;
  bytes: number;
  sha256: string;
  acquisition: string | null;
  lineLength: 82;
  encoding: string;
  profile: Profile;
  tape: TapeProvenance;
  headerRecord?: string | null;
  trailerRecord?: string | null;
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

const fy1988Fixity = registry.get("nara.file.fy1988_fixity").value as Fixity;

export const FY1988: SourceFileConfig = {
  name: "RG310.CRIS.FY88.txt",
  // FY 1994's naid and acquisition have no FY 1988 source registered here; left null rather
  // than assumed to match a neighboring year, the same practice as tape.transferMedia and
  // tape.naraCopy below.
  naid: null,
  bytes: fy1988Fixity.bytes,
  sha256: fy1988Fixity.sha256,
  acquisition: null,
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
    // Unlike FY 1994's, no FY 1988 source is registered for when NARA prepared this file's
    // own ASCII-conversion manifest; left null rather than assumed to match FY 1994's date.
    asciiConversion: { manifestPrepared: null, codePage: null },
    evidence: ["nara.conversion.line_form", "nara.conversion.control_bytes", "nara.tape.fy1988_accession"],
  },
  headerRecord: registry.get("nara.file.fy1988_header_record").value as string,
  trailerRecord: registry.get("nara.file.fy1988_trailer_record").value as string,
};
