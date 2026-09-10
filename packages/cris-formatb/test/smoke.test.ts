import { readFileSync } from "node:fs";
import { LINE_BYTES } from "../src/index";

// Asserting LINE_BYTES equals its own literal definition (82) would only fail if someone
// edited the constant -- it never touches real bytes. This ties it to the committed fixture
// instead: 10,004 = 122 * 82.
test("the committed fixture's length is a multiple of NARA's line length", () => {
  const bytes = readFileSync(new URL("../fixtures/fy94-9049442.bin", import.meta.url));
  expect(bytes.length % LINE_BYTES).toBe(0);
  expect(bytes.length).toBe(122 * LINE_BYTES);
});
