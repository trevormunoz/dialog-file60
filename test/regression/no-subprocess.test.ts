import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// Rule: a test never spawns a subprocess. A test that ran `npx tsx` inside a Vitest worker
// deadlocked the runner (the registry-report test, since rewritten to import the report
// function); the registry test later shelled out to grep for source scans, which depended
// on the machine's grep and its flags. Both are now in-process. This pins the rule so the
// next exception has to argue with a failing test rather than a comment.
//
// The walk covers every package's test/ directory, not just the root test/ tree.
// packages/cris-formatb/test/cli.test.ts once spawned five `npx tsx` subprocesses (it now
// calls runCli() in-process), and a root-only walk would not catch a reintroduction there.
// This matches registry.test.ts's own packageSrcDirs() pattern for the same class of scan.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}
const packageTestDirs = (): string[] =>
  readdirSync("packages").map(p => join("packages", p, "test")).filter(existsSync);
const ROOTS = ["test", ...packageTestDirs()];

test("no test file imports node:child_process", () => {
  const files = ROOTS.flatMap(walk);
  expect(files.length).toBeGreaterThan(10);
  const offenders = files.filter(f => /child_process/.test(readFileSync(f, "utf8")) && !f.endsWith("no-subprocess.test.ts"));
  expect(offenders).toEqual([]);
});
