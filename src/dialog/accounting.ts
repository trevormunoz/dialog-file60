// The session accounting block: the stamp line that opens BEGIN and LOGOFF (spec 7.2, 7.9),
// and the cost lines LOGOFF adds beneath its own stamp. Pure functions over Date values --
// neither reads a clock; src/dialog/session.ts supplies the clock and the rate table.
import { registry } from "../registry";

// proto.logoff.template documents the column form both functions reproduce below (ten
// leading spaces before the stamp, two before each `$` amount, two more before its
// description) -- cited here for reachability; the literal spacing is reproduced directly
// rather than re-read from a stored width table, the same way the 1978/1988 sources give it.
registry.get("proto.logoff.template");

export interface Rates { perMinute: number; typeByFormat: Record<string, number>; }
export interface SessionClock { now(): Date; }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** hh:mm:ss, UTC -- the printed time makes no claim about the reader's own time zone (spec
 * 7.2, 7.9 give no zone), and reading UTC here keeps stamp() and LOGOFF's final line
 * reproducible wherever this runs. */
export const hhmmss = (d: Date): string => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

/** The date/time/user line spec 7.9's template and the 1978 File 60 session both open with:
 * ten spaces, the documented lower-case ddmonyy date, the 24-hour time, and the user number
 * prefixed "User" -- `stamp(new Date(Date.UTC(1978, 1, 28, 14, 17, 38)), "316")` reproduces
 * the 1978 transcript's own line exactly. */
export function stamp(d: Date, user: string): string {
  const dd = pad2(d.getUTCDate());
  const mon = MONTHS[d.getUTCMonth()];
  const yy = pad2(d.getUTCFullYear() % 100);
  return `          ${dd}${mon}${yy} ${hhmmss(d)} User${user}`;
}

const row = (amount: number, desc: string): string => `  $${amount.toFixed(2)}  ${desc}`;

/** The LOGOFF cost block beneath its own stamp: connect time at `rates.perMinute`, one line
 * per format actually typed (present even at a documented free rate, rather than dropped --
 * `formats 1, 6 and 8 free`, the 1998 rate card), and the file and search totals. The two
 * totals are equal in this single-file slice -- spec 7.9's template keeps them as separate
 * lines because a real DIALOG search can span files, which this reconstruction never does. */
export function logoffBlock(o: { start: Date; end: Date; user: string; types: Record<string, number>; rates: Rates }): string[] {
  const minutes = (o.end.getTime() - o.start.getTime()) / 60_000;
  const hours = minutes / 60;
  const connectCost = minutes * o.rates.perMinute;
  const formats = Object.keys(o.types).sort((a, b) => Number(a) - Number(b));
  const typeLines = formats.map((f) => {
    const count = o.types[f]!;
    const cost = count * (o.rates.typeByFormat[f] ?? 0);
    return { cost, text: row(cost, `${count} Types in Format ${f}`) };
  });
  const total = connectCost + typeLines.reduce((s, t) => s + t.cost, 0);
  return [
    stamp(o.end, o.user),
    row(connectCost, `${hours.toFixed(3)} Hrs File60`),
    ...typeLines.map((t) => t.text),
    row(total, "Estimated cost File60"),
    row(total, "Estimated cost this search"),
  ];
}
