import raw from "../../registry/evidence.json" with { type: "json" };
import { statusWords, sourceName, sourceGloss, knownSourceKeys } from "../../src/registry/words";
import type { Status } from "../../src/registry";

// One explanatory sentence per status word, for readers who don't know
// the registry vocabulary. Pills keep the one-word class for styling; this sentence sits
// beside a claim wherever a status is shown.
const STATUSES: Status[] = ["documented", "inferred", "chosen"];

test("every status word has a non-empty explanatory sentence", () => {
  for (const s of STATUSES) {
    expect(statusWords(s), `${s} has no explanatory sentence`).toBeTruthy();
    expect(statusWords(s).length).toBeGreaterThan(0);
  }
});

test("status words are distinct from one another", () => {
  const words = STATUSES.map(statusWords);
  expect(new Set(words).size).toBe(words.length);
});

// A reader's citation for every source citation key actually cited in the
// registry -- a name a reader recognizes, not the short identifier the registry joins on.
test("every source key cited in the registry has a reader's citation", () => {
  const keys = new Set<string>();
  for (const entry of Object.values(raw as Record<string, { sources?: { source: string }[] }>)) {
    for (const s of entry.sources ?? []) keys.add(s.source);
  }
  expect(keys.size).toBeGreaterThan(10); // a broken scan must fail loudly, not pass on an empty set
  for (const key of keys) {
    expect(() => sourceName(key), `no citation for ${key}`).not.toThrow();
    expect(sourceName(key).length, `empty citation for ${key}`).toBeGreaterThan(0);
  }
});

test("sourceName throws on a key not in the table", () => {
  expect(() => sourceName("no-such-source")).toThrow();
});

// The reverse of "every cited key has a citation" above:
// every key this module has a citation for must actually be cited by some registry entry, so
// a source's name and gloss cannot outlive the registry entry that cited it.
test("every key in SOURCE_NAMES is cited by at least one registry entry", () => {
  const citedKeys = new Set<string>();
  for (const entry of Object.values(raw as Record<string, { sources?: { source: string }[] }>)) {
    for (const s of entry.sources ?? []) citedKeys.add(s.source);
  }
  const known = knownSourceKeys();
  expect(known.length).toBeGreaterThan(10); // a broken scan must fail loudly, not pass on an empty set
  const orphans = known.filter(p => !citedKeys.has(p));
  expect(orphans, `SOURCE_NAMES has a key no registry entry cites: ${orphans.join(", ")}`).toEqual([]);
});

test("the Blue Sheet citation names File 60 and its date", () => {
  expect(sourceName("bluesheet-1998-page")).toMatch(/File 60/);
  expect(sourceName("bluesheet-1998-page")).toMatch(/1998/);
});

// One plain sentence per source kind, for a reader who does not know
// what a Blue Sheet, Format B, the Curso, or a Computer Chronicles broadcast is.
test("every source key cited in the registry has a gloss", () => {
  const keys = new Set<string>();
  for (const entry of Object.values(raw as Record<string, { sources?: { source: string }[] }>)) {
    for (const s of entry.sources ?? []) keys.add(s.source);
  }
  expect(keys.size).toBeGreaterThan(10);
  for (const key of keys) {
    expect(sourceGloss(key), `no gloss for ${key}`).toBeTruthy();
  }
});

test("sourceGloss is undefined, not throwing, for a key not in the table", () => {
  expect(sourceGloss("no-such-source")).toBeUndefined();
});

test("the Blue Sheet's gloss names its fields, search codes, and sample record", () => {
  expect(sourceGloss("bluesheet-1998-page")).toMatch(/fields, search codes/);
});

// nara-tss-2018 (a 2018 two-page manifest) and
// nara-cris-packet (a 210-page packet of validation statements and Format B element
// descriptions) used to share one citation string, so an inspect-panel reader following
// either key's "Sources" line read the same wrong name for both documents. Two different
// keys may share a sourceName only when they are the same document in two forms -- the
// Blue Sheet as published and its stripped-text twin.
test("two different source keys never share a sourceName, except the Blue Sheet page/text pair", () => {
  const keys = new Set<string>();
  for (const entry of Object.values(raw as Record<string, { sources?: { source: string }[] }>)) {
    for (const s of entry.sources ?? []) keys.add(s.source);
  }
  const SAME_DOCUMENT_TWO_FORMS = new Set([
    "bluesheet-1998-page",
    "bluesheet-1998-text",
  ]);
  const byName = new Map<string, string[]>();
  for (const key of keys) {
    const name = sourceName(key);
    const group = byName.get(name) ?? [];
    group.push(key);
    byName.set(name, group);
  }
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const isTheAllowedPair = group.length === 2 && group.every(p => SAME_DOCUMENT_TWO_FORMS.has(p));
    expect(isTheAllowedPair, `sourceName "${name}" is shared by ${group.join(", ")}`).toBe(true);
  }
});
