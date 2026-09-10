import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Structural rule: no external code or font requests at runtime. The one
// permitted cross-origin request class is the corpus itself, and after the site build the
// bundle legitimately contains that one host. So this asserts a stricter thing than "no
// URLs": every absolute URL in the built JavaScript must share one origin, and dist/ itself
// says what that origin should be, never a shell env var. A
// CDN script, a web font, an analytics beacon or a stray documentation link in a registry
// note all fail it, and so does a second, different remote origin sneaking in beside the
// corpus base.
//
// Every expectation here comes from dist/ alone; the env var is not read anywhere in this
// file. Taking the expected origin from process.env.VITE_CORPUS_BASE_URL instead would let a
// stale dist/ (built under a different shell) pass or fail by accident rather than by what
// was actually shipped.
//
// The test skips when dist/ has not been built, rather than spawning vite -- a Vitest test
// never starts a child process (test/regression/no-subprocess.test.ts). `pnpm build` (or
// `pnpm build:site`) then `pnpm test` is the sequence; CI runs neither, which is why the
// built output is reviewed in a commit.
const DIST = "dist";
const ABSOLUTE_URL = /\bhttps?:\/\/[^\s"'`)\\]+/g;

const built = existsSync(join(DIST, "index.html"));
const assetsDir = join(DIST, "assets");
const builtJs = built ? readdirSync(assetsDir).filter(f => f.endsWith(".js")) : [];
const bundleText = builtJs.map(f => readFileSync(join(assetsDir, f), "utf8")).join("\n");
const bundleUrls = built ? (bundleText.match(ABSOLUTE_URL) ?? []) : [];
const bundleOrigins = [...new Set(bundleUrls.map(u => new URL(u).origin))];

test.skipIf(!built)("the built HTML contains no absolute URL at all", () => {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  expect(html.match(ABSOLUTE_URL) ?? []).toEqual([]);
});

test.skipIf(!built)("every absolute URL in the built JavaScript shares at most one origin", () => {
  expect(builtJs.length).toBeGreaterThan(0);
  expect(
    bundleOrigins,
    `more than one absolute-URL origin in the bundle: ${bundleOrigins.join(", ")}`,
  ).toHaveLength(Math.min(bundleOrigins.length, 1));
});

test.skipIf(!built || bundleOrigins.length === 0)(
  "the one absolute origin, if any, is the built-in corpus base -- not an unrelated remote URL",
  () => {
    // corpusBase()/offsetsUrl() (src/loader/corpus-urls.ts) assemble the actual fetch URL --
    // corpusBase(env) + "offsets.json" -- at runtime from a variable, so that concatenated
    // string never appears as one literal in the bundle; only its two pieces do. Vite inlines
    // import.meta.env as a plain object literal, and object keys survive minification, so the
    // `VITE_CORPUS_BASE_URL:"..."` property name is a stable anchor: finding the one allowed
    // origin attached to that specific key -- rather than to some other absolute URL that
    // happens to share its shape -- is what ties it to the offsets.json fetch instead of to a
    // CDN script or font host that snuck in elsewhere in the bundle.
    const match = bundleText.match(/\bVITE_CORPUS_BASE_URL:"(https?:\/\/[^"]+)"/);
    expect(match, "no VITE_CORPUS_BASE_URL literal found in the bundle").not.toBeNull();
    expect(new URL(match![1]!).origin).toBe(bundleOrigins[0]);
    expect(bundleText).toContain("offsets.json");
  },
);

test.skipIf(!built)("no font or CDN host appears anywhere in the built output", () => {
  const files = [join(DIST, "index.html"), ...readdirSync(assetsDir).map(f => join(assetsDir, f))];
  const text = files.filter(f => /\.(js|html|css|json)$/.test(f)).map(f => readFileSync(f, "utf8")).join("\n");
  for (const host of [
    "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com",
    "cdn.jsdelivr.net", "unpkg.com", "esm.sh", "code.jquery.com",
    "google-analytics.com", "googletagmanager.com",
  ]) {
    expect(text, `the built output reaches ${host}`).not.toContain(host);
  }
});

test.skipIf(!built)("dist ships no corpus when the bundle carries a remote origin", () => {
  // publicDir:false under a non-root APP_BASE (vite.config.ts) -- a site build's bundle
  // references a remote corpus origin and must never also ship the 277 MB corpus in dist/. A
  // plain local build has no remote origin and may still carry dist/corpus (public/corpus/
  // copied verbatim) -- unconditional now on what dist/ actually contains, not on whether a
  // VITE_CORPUS_BASE_URL happened to be set in this shell.
  if (bundleOrigins.length > 0) {
    expect(existsSync(join(DIST, "corpus"))).toBe(false);
  }
});
