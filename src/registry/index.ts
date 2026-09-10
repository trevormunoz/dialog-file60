// Typed loader for registry/evidence.json.
//
// packages/cris-formatb (the shared Format B reader) has no runtime dependency on this
// registry; it is used by other workspace projects and stays free-standing. Where its
// behavior is drawn from evidence, it cites the registry key in a comment instead of
// calling registry.get(). See profiles.ts, offsets.ts, index.ts. The regression test in
// test/regression/registry.test.ts scans packages/cris-formatb/src for those comment
// citations, in addition to scanning src and packages/*/src for actual registry.get()
// calls, so a key cited only in a comment still has to exist in registry/evidence.json.
import raw from "../../registry/evidence.json" with { type: "json" };

/** Three statuses. There is no separate applicability axis; each source carries its own
 * sourceDate, and that date says which period the entry rests on. */
export type Status = "documented" | "inferred" | "chosen";
export interface EvidenceSource { source: string; locator: string; sourceDate: string; observedSystem: string; }
export interface Evidence {
  value: unknown; status: Status; sources?: EvidenceSource[];
  decision?: string; conflicts?: string; note?: string;
  /** One plain sentence stating what the rule says in a reader's terms -- no registry key
   * names, source tags, or jargon. Where the entry is "chosen" and holds no value, the claim
   * states what is not held and what this reconstruction does instead. */
  claim: string;
}
const table = raw as Record<string, Evidence>;
export const registry = {
  get(key: string): Evidence { const e = table[key]; if (!e) throw new Error(`unknown registry key: ${key}`); return e; },
  keys(): string[] { return Object.keys(table); },
};
