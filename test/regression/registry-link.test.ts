import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The bar's "registry" link pointed at "/registry/evidence.json", a
// root-absolute path to a directory that is not inside public/ and is served by nothing --
// a 404 locally and a 404 under the site's /site-barcstory base. The registry is bundled
// (src/registry/index.ts imports the JSON), so the link must come from Vite's ?url import,
// which emits the file as a build asset and returns a base-prefixed URL. This test reads the
// source rather than executing main.ts, which runs top-level await fetch() on module load.
const main = readFileSync("src/app/main.ts", "utf8");

// statement.ts also carried its own hard-coded `href="/registry/..."`, so main.ts alone is
// never the whole surface a root-absolute path can hide in. Every .ts
// file under src/app/ (not just main.ts) is scanned for the negative, no-root-absolute-path
// assertions below.
const APP_DIR = "src/app";
const appFiles = readdirSync(APP_DIR).filter(f => f.endsWith(".ts"));
const appSources = appFiles.map(f => [f, readFileSync(join(APP_DIR, f), "utf8")] as const);

test("the registry link comes from a ?url import, not a hand-written root-absolute path", () => {
  expect(main).toMatch(/import\s+registryUrl\s+from\s+"\.\.\/\.\.\/registry\/evidence\.json\?url"/);
  expect(main).toMatch(/registryLink\.href\s*=\s*registryUrl/);
  for (const [file, source] of appSources) {
    expect(source, `${file} hard-codes a "/registry" href`).not.toMatch(/href\s*=\s*"\/registry/);
  }
});

test("no root-absolute corpus path is left in the app wiring", () => {
  for (const [file, source] of appSources) {
    expect(source, `${file} fetches a root-absolute /corpus path`).not.toMatch(/fetch\("\/corpus/);
    expect(source, `${file} builds a root-absolute /corpus/ template`).not.toMatch(/`\/corpus\//);
  }
});

test("every fetched URL is built by the corpus-urls helpers", () => {
  expect(main).toMatch(/offsetsUrl\(import\.meta\.env\)/);
  expect(main).toMatch(/indexUrls\(PHRASE_FIELDS, import\.meta\.env\)/);
  expect(main).toMatch(/corpusUrl\(offsets\.file, import\.meta\.env\)/);
});

// main.ts now loads every artifact through fetchJsonArtifact (src/retrieval/artifact.ts),
// which is where res.ok is checked and the URL + HTTP status are attached to a typed
// ArtifactUnavailable -- so a failed load still names the URL and status rather than
// surfacing an opaque JSON parse error. The behaviour moved out of main.ts's old
// `fetchJson` helper into that shared, directly-tested validator (test/regression/artifact.test.ts).
const artifact = readFileSync("src/retrieval/artifact.ts", "utf8");
test("a failed load names the URL and the status rather than a JSON parse error", () => {
  expect(main).toMatch(/fetchJsonArtifact\(/);
  expect(artifact).toMatch(/res\.ok/);
  expect(artifact).toMatch(/ArtifactUnavailable/);
});
