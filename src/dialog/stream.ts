/** A rendered value's link back to its Format B source. `valueIndex` selects one value out
 * of a repeated tag's values (a composite grid row, an SC/SN row); omitted, the link covers
 * every value the tag carries (a whole-field line). */
export interface ProvenanceSource { tag: string; valueIndex?: number; }
export interface Provenance { recordOrdinal?: number; sources?: ProvenanceSource[]; registryKeys?: string[]; }
export interface OutputLine { text: string; provenance?: Provenance; }
export const line = (text: string, provenance?: Provenance): OutputLine => provenance ? { text, provenance } : { text };
