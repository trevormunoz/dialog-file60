# 0xAC field-aware correction — human-gate sign-offs (H1–H4)

Companion to `2026-09-15-correct-0xac-field-aware-reading-design.md`. Records the
four required human gates, which no automated gate can close (the frozen oracle
has no cardinality opinion; `field_values` ≡ `joined_value` off the `0xAC` path).

**Correction landed (local, unpushed):** commits `3c32e3f`, `64724bc`, `b693098`
(+ doc fixes `f72a272`, `ae94725`). All automated gates green, including the
full-corpus parity differential (gates 1–2 over FY88/FY89/FY94, both profiles).

## Blast radius (H2 scan + harness differential — cross-checked, agree exactly)

Exactly **4 field occurrences** corpus-wide carry a single-value `0xAC`:

| File | Record (an) | Tag |
|---|---|---|
| FY89 | 2434335 (9139663) | PR |
| FY94 | 719086 (9133211) | PR |
| FY94 | 2566020 (9159027) | PR |
| FY94 | 84845 (9055790) | PB |

FY88: 0. The forensic scan and the parity differential report the same 4
coordinates. Only two tags (PR, PB) actually change output on this corpus.

## H3 — stratified merge review: **SIGNED OFF**

Only 4 records, so the review is exhaustive, not sampled. All four are single
continuous narratives that the old reader split at a wrapped-line boundary,
dropping the `0xAC`:
- FY89 PR: `…tree trunk development.` + `¬Redmax' trees…` → one progress report;
  `'Redmax'` is a cultivar (opening quote recovered).
- FY94 PR 719086: a list of apple cultivars on rootstocks (`'Golden Delicious'`,
  `'Jonagold'`, `'Empire'`, `'Rome'`); the old split fell mid-list.
- FY94 PR 2566020: `…purity. 5x10` + `5 cells…` → the old reader split the number
  `5×10⁵` in half. Corrected: one sentence.
- FY94 PB 84845: a publications list; the old split fell inside a page range
  (`Nature Genetics 7:144-147`).

None is a fusion of genuinely-distinct values. Every merge is the faithful reading.

## H4 — before/after rendered output: **SIGNED OFF**

Rendered each record's field via the frozen oracle (old) vs the corrected facade
(new). In all 4, the corrected single value is the faithful reading; the old
split broke a sentence, a quote, a number, or a citation at an arbitrary wrap.

Note (orthogonal): record 2566020 shows `¬` is a **superscript** there (`5×10⁵`),
not a left-quote. The *joining* (this correction, #1) is correct regardless; the
*glyph* is correction #2's concern (code-page rendering). These 4 records are the
natural fixtures for #2. The latin1 "transport + parity, not truth" boundary held.

## H1 — Manual re-sourcing: **SIGNED OFF (corpus-active tags) against the primary source**

Goal: verify the corrected tags are documented non-repeating in a *primary
source*, not only in `construct.gleam` (which gate 4 cannot cross-check).

**Source used:** the NARA CRIS/HNRIMS **Data Element Descriptions** table in
`367_1DP.pdf` (dataset-cards/research/cris-dialog/sources/nara/, extracted from
the web-archive capture of the NARA page; the document `construct.printed_rule`
cites, `construct.gleam:1308`). The table has an explicit **`Repeating Field`**
column (Y/N) read directly, independent of `construct`'s transcription.

**Verified directly (Data Element Descriptions, "Page 8"–"Page 9"):**

| Elem | Field | `Repeating Field` | Our class | Match |
|---|---|---|---|---|
| 44 | PR (Progress) | **N** | SingleValue | ✓ (corpus-active) |
| 45.1 | PB (Publications) | **N** | SingleValue | ✓ (corpus-active) |
| 41 | OB (Objectives) | N | SingleValue | ✓ |
| 42 | AP (Approach) | N | SingleValue | ✓ |
| 43 | DE (Keywords) | N | SingleValue | ✓ |
| 39 | SC (Subcommodity) | Y | MultiValue | ✓ (correctly excluded) |
| 40 | SF (Subfile) | Y | MultiValue | ✓ |
| 46 | PH (Primary Class.) | Y | MultiValue | ✓ |
| 47 | GH (General Class.) | Y | MultiValue | ✓ |
| 45.2 | HP (History Pubs) | Y | MultiValue (unsourced) | ✓ |

The only two tags that change output on this corpus — **PR and PB — are documented
`Repeating Field: N` in the primary NARA source**, matching `construct` exactly.
The narrative block (OB/AP/DE) and the excluded classification/heading fields
(SC/SF/PH/GH) corroborate the whole classification against the source.

**Residual (low-priority follow-up):** the remaining ~30 SingleValue scalar tags
(address/date fields, BT/AT/DT, FY/GY) are on earlier pages of the same dictionary
and never fire on this corpus; they can be spot-verified from the same source if/
when they ever appear, but do not affect this correction.
