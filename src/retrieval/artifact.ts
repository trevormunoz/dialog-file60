import { ReconstructionFailure } from "./failures";
import type { Index, Offsets } from "../loader/corpus-format";

/** Fetch one JSON artifact and turn every transport/parse/shape failure into a typed
 * ReconstructionFailure. A shard/index that loads and validates but lacks a queried key is
 * NOT a failure here -- absence is judged by the caller (term-list cross-check / manifest). */
export async function fetchJsonArtifact<T>(url: string, validate: (v: unknown) => v is T): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ReconstructionFailure("ArtifactUnavailable", { url, detail: String(e) });
  }
  if (!res.ok) throw new ReconstructionFailure("ArtifactUnavailable", { url, detail: `HTTP ${res.status} ${res.statusText}` });
  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    throw new ReconstructionFailure("ArtifactInvalid", { url, detail: `not JSON: ${String(e)}` });
  }
  if (!validate(json)) throw new ReconstructionFailure("ArtifactInvalid", { url, detail: "unexpected shape" });
  return json;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(n => typeof n === "number");

/** A word shard or a phrase index's terms map: term -> postings[]. Shallow: checks the
 * container and that values are number arrays; does not walk every posting. */
export const isWordShard = (v: unknown): v is Record<string, number[]> =>
  isObject(v) && Object.values(v).every(isNumberArray);

export const isPositionalShard = (v: unknown): v is Record<string, unknown> => isObject(v);

export const isTermList = (v: unknown): v is [string, number][] =>
  Array.isArray(v) && v.every(p => Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && typeof p[1] === "number");

export const isIndex = (v: unknown): v is Index =>
  isObject(v) && typeof v.code === "string" && isObject(v.terms) && Object.values(v.terms).every(isNumberArray);

export const isOffsets = (v: unknown): v is Offsets =>
  isObject(v) && typeof v.file === "string" && typeof v.sha256 === "string" && Array.isArray(v.records);

export const isPhraseCounts = (v: unknown): v is { phraseTerms: Record<string, number> } =>
  isObject(v) && isObject(v.phraseTerms) && Object.values(v.phraseTerms).every(n => typeof n === "number");
