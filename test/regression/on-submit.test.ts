import { describe, it, expect, vi } from "vitest";
import { makeOnSubmit, type NoticeState } from "../../src/app/onSubmit";
import { ReconstructionFailure } from "../../src/retrieval/failures";

const sinkStub = { print: vi.fn(async () => {}) };

describe("makeOnSubmit", () => {
  it("prints output and clears the notice on a clean command", async () => {
    const session = { submit: vi.fn(async () => [{ text: "S1" }]), lastNotice: null } as any;
    const notices: NoticeState[] = [];
    await makeOnSubmit(() => session, sinkStub, n => notices.push(n))("s cy=x");
    expect(sinkStub.print).toHaveBeenCalledWith([{ text: "S1" }]);
    expect(notices).toEqual([null]);
  });
  it("shows a reconstruction notice and does NOT rethrow when submit throws a ReconstructionFailure", async () => {
    const session = { submit: vi.fn(async () => { throw new ReconstructionFailure("IndexInconsistent"); }), lastNotice: null } as any;
    const notices: NoticeState[] = [];
    await expect(makeOnSubmit(() => session, sinkStub, n => notices.push(n))("t s1/5/1")).resolves.toBeUndefined();
    expect(notices).toEqual([{ kind: "reconstruction" }]);
  });
  it("console.errors an unexpected (non-ReconstructionFailure) throw but still recovers", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = { submit: vi.fn(async () => { throw new Error("prepare() was not called"); }), lastNotice: null } as any;
    const notices: NoticeState[] = [];
    await makeOnSubmit(() => session, sinkStub, n => notices.push(n))("x");
    expect(notices).toEqual([{ kind: "reconstruction" }]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
