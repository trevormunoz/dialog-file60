import { readFileSync } from "node:fs";

// Without a typecheck script, nothing but a person remembering to run
// `tsc --noEmit` by hand catches a type error before commit. This pins the script's presence
// and exact form rather than exec'ing tsc from inside a Vitest test (forbidden: spawning tsc
// from a worker can hang the parallel run the way `npx` does).
test("package.json declares a typecheck script covering root and packages/cris-formatb", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(pkg.scripts.typecheck).toBe(
    "tsc -p tsconfig.json --noEmit && tsc -p packages/cris-formatb/tsconfig.json --noEmit",
  );
});

// The site build is a script, not a remembered incantation of two environment variables.
test("package.json declares build:site", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(pkg.scripts["build:site"]).toBe("./scripts/build-for-site.sh");
});

// The deployed corpus is checked by a script, not by a Vitest test --
// a test never touches the network. This pins the script's presence so the check cannot be
// quietly dropped from the deploy procedure docs/hosting.md describes.
test("package.json declares verify:remote", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(pkg.scripts["verify:remote"]).toBe("tsx scripts/verify-remote.ts");
});
