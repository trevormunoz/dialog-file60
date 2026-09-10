import { reconstructionProse } from "../../src/app/statement";

// The panel carries no live rules list. reconstructionProse is the whole statement panel,
// and takes the corpus offsets and the registry asset URL, threaded in by the caller,
// main.ts, rather than built from a hand-written "/registry/..." path or a ?url import here.
describe("reconstructionProse", () => {
  const offsets = { file: "RG164.CRIS.FY94.txt", sha256: "abcdef0123456789", records: [] };
  // The registry link's href is threaded in as a parameter (main.ts's ?url
  // import), never a literal path -- this value is deliberately unlike a real asset URL
  // (no "/registry/" prefix at all) so a test that accidentally checked the old hard-coded
  // path would fail loudly instead of passing by coincidence.
  const registryUrl = "/assets/evidence-test1234.json";

  test("opens with the reconstruction heading and the framing paragraph", () => {
    const html = reconstructionProse(offsets, registryUrl);
    expect(html).toMatch(/A reconstruction, not a recorded session/);
    expect(html).toMatch(/File 60's documented rules/);
    expect(html).toMatch(/not DIALOG's software/);
    expect(html).toMatch(/not a record of any session that took place/);
  });

  // The framing must name the NARA identifier and say the
  // rules are not all sourced inside 1990-1994.
  test("the framing names the NARA identifier and the sources outside the anchor years", () => {
    const html = reconstructionProse(offsets, registryUrl);
    expect(html).toMatch(/National Archives Identifier 1204533/);
    expect(html).toMatch(/The anchor is c\. 1990-1994/);
    expect(html).toMatch(/1978-1988/);
    expect(html).toMatch(/1998 Blue Sheet/);
    expect(html).toMatch(/2001 Pocket Guide/);
  });

  test("points at the evidence registry with a link to the file", () => {
    const html = reconstructionProse(offsets, registryUrl);
    expect(html).toMatch(/evidence registry<\/a> naming its source, or saying it was inferred or chosen/);
    expect(html).toContain(`href="${registryUrl}"`);
  });

  test("lists no rules in effect", () => {
    const html = reconstructionProse(offsets, registryUrl);
    expect(html).not.toMatch(/<ul>/);
    expect(html).not.toMatch(/<li>/);
    expect(html).not.toMatch(/In this session/);
  });

  test("no registry key and no hash appears outside the Integrity block", () => {
    const html = reconstructionProse(offsets, registryUrl);
    const before = html.split("<details")[0]!;
    expect(before).not.toContain(offsets.sha256);
  });

  test("the Integrity block names the corpus file, sha256, software version, and registry hash", () => {
    const html = reconstructionProse(offsets, registryUrl);
    const details = html.split("<details")[1]!;
    expect(details).toMatch(/Integrity/);
    expect(details).toContain(offsets.file);
    expect(details).toContain(offsets.sha256);
    expect(details).toMatch(/Corpus file/);
    expect(details).toMatch(/SHA-256/);
    expect(details).toMatch(/Software version/);
    expect(details).toMatch(/Registry hash/);
  });

  // The full 64-character hash has no natural break point, so it is shown
  // truncated with a reveal for the rest -- a checkbox+label pair (no second <details>, which
  // would shift the split-based assertions above past the point where Software version and
  // Registry hash appear).
  test("the SHA-256 shows only its first 12 characters, with a toggle that reveals the rest", () => {
    const html = reconstructionProse(offsets, registryUrl);
    const details = html.split("<details")[1]!;
    expect(details).toContain(offsets.sha256.slice(0, 12));
    expect(details).toMatch(/show full/i);
    expect(details).toContain(offsets.sha256); // the full hash is present, not just its prefix
    expect(details).not.toMatch(/<details/); // no nested <details>
  });

  // The checkbox must precede BOTH the short and the full form in DOM order, or a `~` sibling
  // selector cannot hide the short one -- the revealed line used to read as the prefix
  // immediately followed by the full hash (a wrong hash string if copied).
  test("the short prefix carries a class the stylesheet hides once the toggle is checked", () => {
    const html = reconstructionProse(offsets, registryUrl);
    const details = html.split("<details")[1]!;
    expect(details).toMatch(/<code class="hash-short">[0-9a-f]{12}<\/code>/);
    expect(details).toMatch(/<code class="hash-full">[0-9a-f]+<\/code>/);
    const checkboxIndex = details.indexOf('id="hash-full-toggle"');
    const shortIndex = details.indexOf('class="hash-short"');
    const fullIndex = details.indexOf('class="hash-full"');
    expect(checkboxIndex).toBeGreaterThan(-1);
    expect(checkboxIndex).toBeLessThan(shortIndex);
    expect(checkboxIndex).toBeLessThan(fullIndex);
  });
});
