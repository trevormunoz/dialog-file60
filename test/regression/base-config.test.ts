import { appBase } from "../../config/base";

// The app is served at "/" locally and at "/site-barcstory/file60/" on
// the BARC story site (GitHub project Pages, base "/site-barcstory"). One env var carries
// that difference; these tests pin its normalisation so a base without slashes cannot
// silently produce "/site-barcstoryassets/index.js".

test("no APP_BASE means the site root", () => {
  expect(appBase({})).toBe("/");
  expect(appBase({ APP_BASE: "" })).toBe("/");
});

test("a bare path is normalised to leading and trailing slashes", () => {
  expect(appBase({ APP_BASE: "site-barcstory/file60" })).toBe("/site-barcstory/file60/");
  expect(appBase({ APP_BASE: "/site-barcstory/file60" })).toBe("/site-barcstory/file60/");
  expect(appBase({ APP_BASE: "/site-barcstory/file60/" })).toBe("/site-barcstory/file60/");
});

test("a site build takes its base from APP_BASE and ships no public/ directory", async () => {
  const previous = process.env.APP_BASE;
  process.env.APP_BASE = "/site-barcstory/file60/";
  try {
    // @vite-ignore: the query is a runtime cache-buster, not a statically analysable
    // specifier; without this comment Vite's SSR transform rejects the dynamic import
    // outright ("Unknown variable dynamic import") rather than resolving it at runtime.
    const mod = await import(/* @vite-ignore */ `../../vite.config?base=${Date.now()}`);
    const config = mod.default as { base?: string; publicDir?: string | false };
    expect(config.base).toBe("/site-barcstory/file60/");
    expect(config.publicDir).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.APP_BASE;
    else process.env.APP_BASE = previous;
  }
});

test("a local build serves public/ at the site root", async () => {
  const previous = process.env.APP_BASE;
  delete process.env.APP_BASE;
  try {
    // @vite-ignore: see the comment in the previous test.
    const mod = await import(/* @vite-ignore */ `../../vite.config?local=${Date.now()}`);
    const config = mod.default as { base?: string; publicDir?: string | false };
    expect(config.base).toBe("/");
    expect(config.publicDir).toBe("public");
  } finally {
    if (previous !== undefined) process.env.APP_BASE = previous;
  }
});
