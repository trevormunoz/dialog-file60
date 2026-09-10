import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// This test pins scripts/naive-split.py's bytes by sha256 and its import list rather than
// executing it. Running it would mean shelling out to `python3` -- no subprocess is spawned
// from inside a Vitest test, and being Python there is no in-process import available either.
// The confirmation that the script's current output matches fixtures/acceptance-fy94.json
// exactly is recorded in fixtures/SOURCES.md alongside the hash asserted below; `pnpm
// verify:acceptance` re-runs that confirmation outside Vitest.
const SCRIPT = "scripts/naive-split.py";
const SOURCES_FILE = "fixtures/SOURCES.md";

test("naive-split.py's bytes match the sha256 recorded in fixtures/SOURCES.md", () => {
  const sources = readFileSync(SOURCES_FILE, "utf8");
  const match = sources.match(/naive-split\.py[\s\S]*?\nsha256:\s*([0-9a-f]{64})/);
  expect(match, `${SOURCES_FILE} is missing naive-split.py's recorded sha256`).not.toBeNull();
  const actual = createHash("sha256").update(readFileSync(SCRIPT)).digest("hex");
  expect(actual, "naive-split.py has changed since it was last hand-run against the corpus (see SOURCES.md)").toBe(
    match![1],
  );
});

test("naive-split.py shares no code with the TS reader: it imports only json and sys", () => {
  const src = readFileSync(SCRIPT, "utf8");
  const imports = [...src.matchAll(/^import\s+(.+)$/gm)].map(m => m[1]!.trim());
  expect(imports).toEqual(["json, sys"]);
});
