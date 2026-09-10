import { corpusBase, offsetsUrl, indexUrl, corpusUrl, indexUrls, wordTermsUrl, wordShardUrl } from "../../src/loader/corpus-urls";
import { PHRASE_FIELDS } from "../../src/loader/corpus-format";

// Every URL the browser fetches is derived from two values --
// import.meta.env.BASE_URL (where the app itself is served) and VITE_CORPUS_BASE_URL
// (where the corpus and its indexes are served). Root-absolute "/corpus/..." paths broke
// under the site's /site-barcstory base; these tests pin the replacement.

test("with no corpus base configured, the corpus sits under the app's own base", () => {
  expect(corpusBase({ BASE_URL: "/" })).toBe("/corpus/");
  expect(corpusBase({ BASE_URL: "/site-barcstory/file60/" })).toBe("/site-barcstory/file60/corpus/");
});

test("an empty VITE_CORPUS_BASE_URL is treated as unset, not as an empty base", () => {
  expect(corpusBase({ BASE_URL: "/", VITE_CORPUS_BASE_URL: "" })).toBe("/corpus/");
});

test("a configured corpus base wins and always ends in exactly one slash", () => {
  expect(corpusBase({ BASE_URL: "/site-barcstory/file60/", VITE_CORPUS_BASE_URL: "https://corpus.example/v1" }))
    .toBe("https://corpus.example/v1/");
  expect(corpusBase({ BASE_URL: "/", VITE_CORPUS_BASE_URL: "https://corpus.example/v1/" }))
    .toBe("https://corpus.example/v1/");
});

test("a missing BASE_URL falls back to the site root", () => {
  expect(corpusBase({})).toBe("/corpus/");
});

test("the three fetched URLs are built from that one base", () => {
  const env = { BASE_URL: "/site-barcstory/file60/", VITE_CORPUS_BASE_URL: "https://corpus.example/v1/" };
  expect(offsetsUrl(env)).toBe("https://corpus.example/v1/offsets.json");
  expect(indexUrl("CY", env)).toBe("https://corpus.example/v1/index/CY.json");
  expect(corpusUrl("RG164.CRIS.FY94.txt", env)).toBe("https://corpus.example/v1/RG164.CRIS.FY94.txt");
});

test("indexUrls covers exactly the built phrase fields, in order", () => {
  const env = { BASE_URL: "/" };
  expect(indexUrls(PHRASE_FIELDS, env).map(([c]) => c)).toEqual([...PHRASE_FIELDS]);
  expect(indexUrls(PHRASE_FIELDS, env).map(([, u]) => u))
    .toEqual([...PHRASE_FIELDS].map(c => `/corpus/index/${c}.json`));
});

// Sharded word indexes resolve through this same base.
test("wordTermsUrl and wordShardUrl resolve through the configured corpus base", () => {
  const env = { BASE_URL: "/site-barcstory/file60/", VITE_CORPUS_BASE_URL: "https://corpus.example/v1/" };
  expect(wordTermsUrl("/TI", env)).toBe("https://corpus.example/v1/word/TI/terms.json");
  expect(wordShardUrl("/TI", "A", env)).toBe("https://corpus.example/v1/word/TI/A.json");
});

test("wordTermsUrl and wordShardUrl strip the code's punctuation for a path-safe directory", () => {
  const env = { BASE_URL: "/" };
  expect(wordTermsUrl("PO=", env)).toBe("/corpus/word/PO/terms.json");
  expect(wordShardUrl("PO=", "_", env)).toBe("/corpus/word/PO/_.json");
});

test("with no corpus base configured, word URLs sit under the app's own base", () => {
  const env = { BASE_URL: "/site-barcstory/file60/" };
  expect(wordTermsUrl("/DE", env)).toBe("/site-barcstory/file60/corpus/word/DE/terms.json");
  expect(wordShardUrl("/DE", "5", env)).toBe("/site-barcstory/file60/corpus/word/DE/5.json");
});

test("a missing BASE_URL falls back to the site root for word URLs too", () => {
  expect(wordTermsUrl("/TX", {})).toBe("/corpus/word/TX/terms.json");
  expect(wordShardUrl("/TX", "Z", {})).toBe("/corpus/word/TX/Z.json");
});
