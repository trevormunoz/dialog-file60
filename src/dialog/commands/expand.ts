import type { DialogCommand } from "../ast";
import type { DialogSession } from "../session";
import { line, type OutputLine } from "../stream";
import { UnknownSuffix, UnknownField } from "../../retrieval/engine";
import { expandWindow, expandPage, expandLines, BASIC_INDEX, PAGE_ROWS } from "../expand";
import { wrapRef } from "./shared";
import { registry } from "../../registry";

registry.get("proto.error.unknown_suffix");
registry.get("proto.error.unknown_field");
registry.get("proto.error.bad_file");

export async function runExpand(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "expand" }>): Promise<OutputLine[]> {
  if (session.currentFile === null) return [line(`? ${cmd.term.trim().toUpperCase()}`, { registryKeys: ["proto.error.bad_file"] })];
  const prefixMatch = /^([A-Za-z]{2})=(.*)$/.exec(cmd.term);
  const code = prefixMatch ? prefixMatch[1]!.toUpperCase() : BASIC_INDEX;
  const enteredRaw = (prefixMatch ? prefixMatch[2]! : cmd.term).trim();
  const entered = enteredRaw === "" ? null : enteredRaw.toUpperCase();
  let terms: [string, number][];
  try { terms = await session.engine.termList(code); }
  catch (e) {
    if (e instanceof UnknownSuffix) return [line(`? ${e.code}`, { registryKeys: ["proto.error.unknown_suffix"] })];
    if (e instanceof UnknownField) {
      // A documented prefix this build has no index for (see SELECT's own UnknownField
      // branch in commands/select.ts) routes to the same capability-notice channel, not the
      // simulated typo error.
      if (e.documented) { session.lastNotice = { command: `${e.field.toUpperCase()}= (search prefix)` }; return []; }
      return [line(`? ${e.field.toUpperCase()}=${entered ?? ""}`, { registryKeys: ["proto.error.unknown_field"] })];
    }
    throw e;
  }
  const w = entered !== null ? expandWindow(terms, entered) : { start: 0, enteredAt: null, absent: false };
  session.expand = expandPage({ terms, start: w.start, firstRef: 1, entered, enteredAt: w.enteredAt, absent: w.absent, code });
  return expandLines(session.expand).map(t => line(t, { registryKeys: ["proto.expand.display", "proto.expand.window", "proto.expand.page", "proto.expand.enumbers"] }));
}

export async function runPage(session: DialogSession, cmd: Extract<DialogCommand, { cmd: "page" }>): Promise<OutputLine[]> {
  // PAGE- moves back two windows from the state's own `start` (already the position
  // just past the page shown, so one PAGE_ROWS back reaches the start of that page, and
  // a second reaches the page before it); a plain PAGE continues forward from `start`
  // as it stands (proto.expand.page: "the next 12 entries"). expandPage still gets the
  // original entered/enteredAt/absent so an absent entered term stays in the browsed
  // list at its inserted position on every later page (2001: "the original EXPAND entry
  // is no longer asterisked" says the row is still there, just unstarred) -- the star is
  // cleared afterward, not by passing entered: null into expandPage, which would drop an
  // absent term's inserted row entirely instead of only un-starring it.
  if (!session.expand) return [line(`? ${cmd.back ? "PAGE-" : "PAGE"}`, { registryKeys: ["proto.error.unknown_command"] })];
  const { terms, code, entered, enteredAt, absent } = session.expand;
  const start = cmd.back ? Math.max(0, session.expand.start - 2 * PAGE_ROWS) : session.expand.start;
  const firstRef = cmd.back ? wrapRef(session.expand.nextRef - 2 * PAGE_ROWS) : session.expand.nextRef;
  // paged.entered stays the original entered term (not null): a later PAGE or PAGE- must
  // still see it, so an absent term's inserted row keeps its position across every
  // further page of the same EXPAND browse, not just the first PAGE call.
  const paged = expandPage({ terms, start, firstRef, entered, enteredAt, absent, code });
  session.expand = { ...paged, rows: paged.rows.map(r => ({ ...r, starred: false })) };
  return expandLines(session.expand).map(t => line(t, { registryKeys: ["proto.expand.page", "proto.expand.enumbers"] }));
}
