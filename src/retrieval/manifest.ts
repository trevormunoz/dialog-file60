import type { Index } from "../loader/corpus-format";
import { ReconstructionFailure } from "./failures";

/** Compare each loaded phrase index against the build-time manifest (report.phraseTerms).
 * A mismatch -- empty where the build had N, or any count drift -- is category-D drift, not a
 * historical zero. A code the manifest records as 0 and serves empty is a legitimate zero. */
export function checkPhraseManifest(indexes: Record<string, Index>, phraseTerms: Record<string, number>): void {
  for (const [code, idx] of Object.entries(indexes)) {
    const expected = phraseTerms[code];
    if (expected === undefined) continue; // manifest silent on this code: nothing to check
    const actual = Object.keys(idx.terms).length;
    if (actual !== expected) {
      throw new ReconstructionFailure("IndexInconsistent", { url: `index/${code}.json`, detail: `phrase index ${code}: ${actual} terms loaded, manifest expected ${expected}` });
    }
  }
}
