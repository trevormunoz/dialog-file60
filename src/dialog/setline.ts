import { registry } from "../registry";

const cols = registry.get("render.setline.columns").value as { setCol: number; itemsEnd: number; descCol: number };

/** Set number at column setCol (1-based), items right-aligned ending at itemsEnd, description from descCol. */
export function setLine(id: number | null, items: number, desc: string): string {
  const setText = id === null ? "" : `S${id}`;
  const left = " ".repeat(cols.setCol - 1) + setText;
  const itemsText = String(items);
  const padded = left + " ".repeat(Math.max(1, cols.itemsEnd - left.length - itemsText.length)) + itemsText;
  return padded + " ".repeat(Math.max(1, cols.descCol - padded.length - 1)) + desc;
}
