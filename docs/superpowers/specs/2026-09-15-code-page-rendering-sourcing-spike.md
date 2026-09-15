# Correction #2 (code-page rendering) — sourcing spike & deferral

**Date:** 2026-09-15
**Status:** spike complete; **deferred as a *correction*** (fails the program's
sourcing bar). May be revisited later as an explicitly-speculative *display
feature* — which is not the same thing.
**Relationship:** second of the three deferred corrections in
`2026-09-15-unify-gleam-reader-behind-facade-design.md`. Unlike correction #1
(the `0xAC` field-aware fix, which had a documented rule — `Repeating: N` in the
NARA data-element dictionary), #2's answer was never written down.

## Question

The free-text fields (OB/AP/DE/PR/PB) carry a scatter of high bytes and rare
control bytes — the EBCDIC→ASCII conversion residue (`registry/evidence.json`
`nara.conversion.control_bytes`, second population). `latin1.decode` renders each
as a transport glyph ("not truth"). Can the *intended* glyph be **sourced**, so a
rendering fix could be a sourced correction like #1?

## What the residue is (census over FY88/FY89/FY94, free-text fields only)

~48 distinct artifact bytes; the top ~13 are >90% of volume and are
**scientific typography** the conversion could not carry to 7-bit ASCII:

| byte(s) | intended (context-read) | example |
|---|---|---|
| A3 / A5 / B7 / A9 / A7 / B6 | superscript 1/2/3/4/5/6 | `¬4CO(2)` → ¹⁴CO₂; `³²P`; `¹⁵N` |
| FE / B5 | superscript + / − (ion charge, exponent) | Ca²⁺, NH₄⁺, mg ha⁻¹ |
| A2 / F6 (open), A8 / DD / F3 (close) | bracket / paren pairs | `[¹⁴C]GA`, `(SBM)` |
| BD / DE | Greek α,β / superscript letters | `5α-reductase`; `tRNA^Val` |
| 0E / 0F | **SO / SI shift** (special-set toggle), exactly 35/35 paired | `N␏2␎` → N₂; `38␎o␏C` → 38°C |
| 08 | **BACKSPACE overstrike** | `B⌫a⌫c⌫t…` = overstruck "Bacter…" |
| AC (in prose) | **non-injective**: ‘ / ’ / ° / `<` by context | `¬Colt' cherry` (‘); `-33¬C` (°) |

The residue is not a character set so much as the **ash of a rendering machine**:
a shift-toggled special-graphics set (SO/SI) plus overstrike composition.

## Why it cannot be sourced — four refutations

1. **NARA printouts (`367_1DP.pdf`).** The two sample line-printer dumps printed
   only plain-text records (an economics project, forestry) with **none** of these
   bytes. Statement of absence (found by `pdftotext` + image render over all 210
   pages; only 2 records, both from the head of their files, were ever printed).
   The one visible high byte, `0xAC`→`¬`, is the *structural* SC/SN delimiter — the
   printer's own glyph, not prose intent.
2. **EBCDIC fingerprint — refuted.** No standard EBCDIC page (cp037/500/1047)
   reproduces the intended glyphs; `0xA2`–`0xA9` are just `s`–`z` in cp037/500,
   undefined in cp1047. Superscripts / ion-charges / Greek are not single EBCDIC
   code points at all, so the bytes are not raw pass-through EBCDIC values.
3. **Terminal / printer code page — none documented.** `display-evidence.md`
   concludes "no glyph form is a DIALOG property"; the Hazeltine-terminal claim is
   itself a statement of absence (`hazeltine-memo-comparison.md`).
4. **Non-injective.** `0xAC` alone reads as ‘, ’, °, and `<` by context; SO/SI
   means a byte's glyph depends on shift state; overstrike composes a "character"
   across byte positions. No flat 256-entry table can express any of this.

`CRIS_TSS367.pdf` documents only "ASCII Text … Record_Length 82" — no character
set. The `field-rule-inventory.md` "speculative context map" is, correctly, a
reading of surrounding text, not a decode against a documented table.

## Verdict

**Not sourceable from any evidence in hand**, and **not a flat code page** — it is
context-dependent, non-injective, shift-toggled, and overstruck. Therefore any
rendering fix is **inference by construction**, which fails the corrections
program's "never infer a rule from data" bar.

## Decision & guidance for a future speculative layer

- **Deferred as a correction.** Do not present a rendered glyph as truth or on the
  parity path; `latin1.decode` stays the honest "we don't know" transport render.
- **If revisited as a display feature** (a separate, explicitly-speculative view):
  keep the raw `BitArray` as the record of truth; render corrections as a *labeled*
  overlay carrying per-byte confidence; and model the **SO/SI shift + overstrike
  machine**, not a flat table (a flat lookup would misrender exactly the
  hardest, SO/SI-bracketed and overstruck regions). The only routes to a *sourced*
  map are NARA's actual conversion table (undated 1995–2018; not in these PDFs) or
  a printout of a *scientific* record (none exists in hand).
- **Next:** correction #3 (non-ASCII tags), which is determinate and sourceable.

All statements of absence above are provisional on wider reading.
