import { parseExpression } from "../../src/dialog/parser";

test("a trailing ? on a suffixed word parses as a truncation, keeping the operand as typed", () => {
  expect(parseExpression("technolog?/ti")).toEqual({
    kind: "trunc", codes: ["/TI"], stem: "TECHNOLOG", echo: "TECHNOLOG?/TI",
  });
});

test("a trailing ? with no suffix truncates over the merged Basic Index", () => {
  expect(parseExpression("oyster?")).toEqual({
    kind: "trunc", codes: ["*"], stem: "OYSTER", echo: "OYSTER?",
  });
});

test("the bounded and spaced truncation forms are refused, not read as one ?", () => {
  expect(parseExpression("technolog??/ti")).toBeNull();
  expect(parseExpression("technolog? ?/ti")).toBeNull();
  expect(parseExpression("techno?logy/ti")).toBeNull();
});
