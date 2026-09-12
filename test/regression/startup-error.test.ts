// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderStartupError } from "../../src/app/startup-error";

describe("renderStartupError", () => {
  it("renders a modern panel and no DIALOG-looking content", () => {
    const root = document.createElement("div");
    renderStartupError(root);
    expect(root.textContent).toMatch(/could not load/i);
    expect(root.textContent).not.toMatch(/\?/);
    expect(root.querySelector(".reconstruction-error")).not.toBeNull();
  });
});
