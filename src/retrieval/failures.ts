/** Category-D failures: the reconstruction itself could not load or trust its own data.
 * Distinct from the historical-error classes (UnknownSet, …) and from build-time
 * FixityMismatchError. Rendered as modern chrome, never as a `? …` stream line. */
export type ReconstructionFailureCode =
  | "ArtifactUnavailable"   // fetch not ok / network / missing
  | "ArtifactInvalid"       // unparseable JSON, or valid JSON of the wrong shape
  | "IndexInconsistent"     // artifact disagrees with the manifest, or a word shard drifted from its term list
  | "RangeReadFailed"       // byte-range read failed or was truncated
  | "CorpusRangeInvalid";   // an offset pair that cannot describe a record

/** One sentence, shown for every per-command D failure. The specific code/url/detail
 * go to the console, never into this user-facing string. */
export const RECONSTRUCTION_FAILURE_MESSAGE =
  "This reconstruction could not load part of its data. This is a fault in the reconstruction, not a DIALOG response.";

export class ReconstructionFailure extends Error {
  readonly code: ReconstructionFailureCode;
  readonly url?: string;
  readonly detail?: string;
  constructor(code: ReconstructionFailureCode, opts: { url?: string; detail?: string } = {}) {
    super(RECONSTRUCTION_FAILURE_MESSAGE);
    this.name = "ReconstructionFailure";
    this.code = code;
    this.url = opts.url;
    this.detail = opts.detail;
  }
}
