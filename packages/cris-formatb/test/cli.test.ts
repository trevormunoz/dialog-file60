import { fileURLToPath } from "node:url";
import { runCli, CliError } from "../src/cli";

// These tests spawn no subprocess. Spawning `npx tsx src/cli.ts ...` from inside a Vitest
// test is the exact pattern the rest of the repository warns has deadlocked a parallel run.
// runCli() is the CLI's argv handling exported as a pure function; these tests call it
// in-process instead. Fixture paths are resolved to absolute file URLs rather than relying on
// process.cwd(), since the real CLI runs with cwd set to this package directory, which an
// in-process call does not do on its own.
const fixture = fileURLToPath(new URL("../fixtures/fy94-9049442.bin", import.meta.url));

test("cli record prints tags with line numbers for a fixture slice, given the slice's own base line", () => {
  const rec = JSON.parse(runCli(["record", fixture, "83052", "--base-line", "83052"]));
  expect(rec.an).toBe("9049442");
  expect(rec.fields.find((f: { tag: string }) => f.tag === "DS").values[0].line).toBe(83057);
});

test("cli record echoes the parsed profile in its JSON output", () => {
  const withDefault = JSON.parse(runCli(["record", fixture, "83052", "--base-line", "83052"]));
  expect(withDefault.profile).toBe("fy1991plus");
  const withExplicit = JSON.parse(runCli(["record", fixture, "83052", "--base-line", "83052", "--profile", "fy1988"]));
  expect(withExplicit.profile).toBe("fy1988");
  expect(withExplicit.an).toBe("9049442"); // fy1988 parses the same record content as fy1991plus
});

test("cli record rejects an unknown --profile value with exit code 1 and a message naming it", () => {
  expect.assertions(3);
  try {
    runCli(["record", fixture, "83052", "--base-line", "83052", "--profile", "bogus"]);
  } catch (e) {
    expect(e).toBeInstanceOf(CliError);
    expect((e as CliError).exitCode).toBe(1);
    expect((e as CliError).message).toMatch(/unknown --profile "bogus"/);
  }
});

test("cli record defaults --base-line to 1, matching a slice numbered from its own start", () => {
  const rec = JSON.parse(runCli(["record", fixture, "1"]));
  expect(rec.an).toBe("9049442");
});

test("cli record errors when the requested first line does not match any span at the given --base-line", () => {
  expect(() => runCli(["record", fixture, "999", "--base-line", "83052"])).toThrow(CliError);
});

test("cli scan prints AN, firstLine, lastLine tab-separated for a fixture slice", () => {
  const out = runCli(["scan", fixture]);
  expect(out).toBe("9049442\t1\t122\n");
});
