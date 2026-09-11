#!/usr/bin/env python3
"""Independent checker. Splits the raw file on CRLF+"$$", joins column 4-72 slices.
A leading 0xAC on a continuation line starts a new value (a separate repeating field
value, not more text appended to the value already open) -- see registry key
formatb.encoding.continuation_0xAC. No shared code with packages/cris-formatb.
Usage: python3 scripts/naive-split.py data/RG164.CRIS.FY94.txt > fixtures/acceptance-fy94.json
"""
import json, re, sys
from collections import Counter

def values(rec: bytes, tag: bytes) -> list[str]:
    out: list[bytearray] = []
    cur: bytearray | None = None
    for line in rec.split(b"\r\n"):
        if len(line) < 3:
            continue
        t, d = line[:2], line[3:72]
        if t == tag:
            cur = bytearray(d); out.append(cur)
        elif t == b"  " and cur is not None:
            if d[:1] == b"\xac":
                cur = bytearray(d[1:]); out.append(cur)
            else:
                cur += d
        else:
            cur = None
    return [bytes(v).rstrip().decode("latin-1") for v in out]

# Word-index check for S PEACH/TI (spec 6.4's tokenizer, hand-written here rather than
# imported: uppercase, split on anything that is not a letter, a digit or a hyphen, drop a
# hyphenated token's leading/trailing hyphens, drop the nine 2001 stop words, and index a
# hyphenated token both whole and as its parts. No code shared with src/loader/words.ts.
STOP_WORDS = {"AN", "BY", "FROM", "THE", "WITH", "AND", "FOR", "OF", "TO"}

def tokenize_ti(text: str) -> list[str]:
    out: list[str] = []
    cur = ""
    def flush() -> None:
        nonlocal cur
        t = cur.strip("-")
        if t and t not in STOP_WORDS:
            out.append(t)
            if "-" in t:
                for part in t.split("-"):
                    if part and part not in STOP_WORDS:
                        out.append(part)
        cur = ""
    for ch in text.upper():
        if ch.isascii() and (ch.isalnum() or ch == "-"):
            cur += ch
        else:
            flush()
    flush()
    return out

raw = open(sys.argv[1], "rb").read()
recs = [r for r in raw.split(b"\r\n$$") if b"\r\nAN " in r or r.startswith(b"AN ")]
an = lambda r: values(r, b"AN")[0]
belt = [r for r in recs if "BELTSVILLE" in values(r, b"CY")]
both = [r for r in belt if "HAMMERSCHLAG  F A" in values(r, b"IN")]
inham = [r for r in recs if "HAMMERSCHLAG  F A" in values(r, b"IN")]
ti_peach = [r for r in recs if "PEACH" in tokenize_ti(" ".join(values(r, b"TI")))]
greenbelt = [r for r in recs if "GREENBELT" in values(r, b"CY")]
belt_or_green_ans = sorted(set(an(r) for r in belt) | set(an(r) for r in greenbelt))
maryland_ans = set(an(r) for r in recs if "MARYLAND" in values(r, b"ST"))
belt_not_maryland_ans = sorted(an(r) for r in belt if an(r) not in maryland_ans)
# Right truncation (word?): ti_technolog checks a suffixed truncation (S TECHNOLOG?/TI)
# against a tokenizer written fresh for this script (tokenize_ti above), the same
# independence rule ti_peach already follows; cy_beltsvill_trunc checks a bare-stem phrase
# truncation (S CY=BELTSVILL?, which this task does not parse over CY, but
# RetrievalEngine.prefixPostings("CY", "BELTSVILL") is asserted against directly) with a plain
# str.startswith over the raw CY values, no tokenizer involved.
ti_technolog = [r for r in recs if any(t.startswith("TECHNOLOG") for t in tokenize_ti(" ".join(values(r, b"TI"))))]
cy_beltsvill_trunc = [r for r in recs if any(v.startswith("BELTSVILL") for v in values(r, b"CY"))]
# SORT: the AN order of the cy_beltsville set (already derived above) when sorted by PN, the
# Blue Sheet's own File 60 SORT example field ("SORT S13/ALL/PN"). Unlike every other "an" list
# in this fixture -- which is `sorted()` for comparison against a set of ANs regardless of
# retrieval order -- this list is ORDERED, not resorted after this point: it is the answer
# test/archival/sort-corpus.test.ts checks the engine's own sorted set against, item by item.
# PN carries exactly one value per Beltsville record in this corpus (checked separately, not
# asserted here), so ties are broken by AN, which for this subset already equals file order.
belt_by_pn = [an(r) for r in sorted(belt, key=lambda r: ((values(r, b"PN") or [""])[0], an(r)))]
# SORT on IN (multiple investigators): 312 of the 669 Beltsville records carry more than one
# IN value, so this is the one field this task uses to independently derive the multi-valued
# tie-break RetrievalEngine.sortKey now applies -- the alphabetically-first (min()) of the
# record's own IN values, ties broken by AN (proto.sort.multivalue_key; no source documents
# DIALOG's own rule, so this script reimplements the same stated choice fresh, not the engine's
# code). A record with no IN value at all would sort first under key "" -- none exist in this
# corpus's Beltsville set, so this fixture cannot itself prove that empty-key path; the direct
# unit test in test/regression/engine.test.ts covers it with a synthetic index instead.
belt_by_in = [an(r) for r in sorted(belt, key=lambda r: (min(values(r, b"IN"), default=""), an(r)))]
# KWIC (format K): the 2001 manual's window rule -- nn words wide, centred on the match,
# shifted rather than padded when the match sits near an edge, a leading space on any
# ellipsis a cut side carries. Reimplemented fresh here (own word split, own centring math),
# not imported from src/dialog/kwic.ts, the same independence rule every check above follows.
def kwic_word_match(word: str, term: str) -> bool:
    return "".join(ch for ch in word.upper() if ch.isalnum()) == term

def kwic_window(words: list[str], match_idx: int, size: int) -> str:
    before, after = -(-(size - 1) // 2), (size - 1) // 2  # ceil/floor split of size-1
    start, end = match_idx - before, match_idx + after
    if start < 0:
        end += -start
        start = 0
    if end > len(words) - 1:
        start -= end - (len(words) - 1)
        end = len(words) - 1
    start = max(0, start)
    left = "... " if start > 0 else ""
    right = " ..." if end < len(words) - 1 else ""
    return left + " ".join(words[start:end + 1]) + right

# Proximity (W): position-aware check for S FRESH(W)WATER/TI, written fresh here -- counts
# positions over every whitespace-separated word of a TI value, including stop words (the same
# rule Task 7's positional index chose, index.word.positions), so the two derivations are
# comparable. No code shared with src/loader/index-builder.ts's buildPositions or
# src/retrieval/engine.ts's near().
def prox_w(text: str, a: str, b: str, distance: int = 1) -> bool:
    words = [w.strip("-") for w in re.split(r"[^A-Za-z0-9-]+", text.upper()) if w.strip("-")]
    for i, w in enumerate(words):
        if w != a:
            continue
        for j in range(i + 1, min(i + 1 + distance, len(words))):
            if words[j] == b:
                return True
    return False

# FRESH(W)WATER over /TI: a real, small, nonzero pair, chosen after checking several candidates
# by hand (GENE/TRANSFER 39, TISSUE/CULTURE 66, PEACH/TREE 9, FRESH/WATER 2, ... -- a zero count
# proves nothing, so this is a pair actually present, not the corpus's absence of one).
ti_fresh_w_water = [r for r in recs if any(prox_w(v, "FRESH", "WATER") for v in values(r, b"TI"))]
# RANK: the per-set tally of ST values over the cy_beltsville set (already derived above),
# counting each distinct value once per record (`set(values(...))`, the same per-record
# dedup RetrievalEngine.rankValues reads straight off the already-built phrase index --
# index-builder.ts's own `seen` set) -- Trevor's accepted decision (c): a per-set rank tally
# over an acceptance set, not a corpus-wide rank, and not derived from the code under test.
# Sorted by count descending, then term ascending -- the same order rankTally (src/dialog/
# rank.ts) produces, derived independently here with no shared code.
rank_st_over_belt = Counter()
for r in belt:
    for v in set(values(r, b"ST")):
        rank_st_over_belt[v] += 1
# The tie-break below (kv[0], plain Python string ordering) must keep mirroring collate()
# (src/retrieval/engine-helpers.ts: a < b ? -1 : a > b ? 1 : 0) for every field this script
# ranks -- the two happen to agree on this corpus's ASCII field values, but nothing enforces
# that agreement, so a future rankable field with ties in non-ASCII or mixed-case terms could
# silently diverge without either side's test noticing.
rank_st_over_cy_beltsville = sorted(rank_st_over_belt.items(), key=lambda kv: (-kv[1], kv[0]))
# RANK OC (Object Classification code) over the same cy_beltsville set: unlike ST (one value,
# MARYLAND, for all 669 records), OC has 20 distinct values with real ties -- three terms tied
# at count 3, five terms tied at count 2 (the top-8 cutoff falls inside that five-way tie, so
# this also exercises RANK_PAGE's truncation against a genuine tie at the boundary) -- so this
# field, not ST, is what exercises descending order, the collation tie-break and the top-8 cutoff
# together against real data (Trevor's accepted decision, Important 2 of the final review).
rank_oc_over_belt = Counter()
for r in belt:
    for v in set(values(r, b"OC")):
        rank_oc_over_belt[v] += 1
rank_oc_over_cy_beltsville = sorted(rank_oc_over_belt.items(), key=lambda kv: (-kv[1], kv[0]))
rec_9049442 = next(r for r in recs if an(r) == "9049442")
ti_9049442_words = " ".join(values(rec_9049442, b"TI")).split()
ti_9049442_peach_idx = next(i for i, w in enumerate(ti_9049442_words) if kwic_word_match(w, "PEACH"))
kwic_9049442_ti_peach_14 = kwic_window(ti_9049442_words, ti_9049442_peach_idx, 14)
print(json.dumps({
    "records": len(recs),
    "cy_beltsville": {"count": len(belt), "an": sorted(an(r) for r in belt)},
    "cy_beltsville_and_in_hammerschlag_f_a": {"count": len(both), "an": sorted(an(r) for r in both)},
    "in_hammerschlag_f_a": {"count": len(inham), "an": sorted(an(r) for r in inham)},
    "ti_peach": {"count": len(ti_peach), "an": sorted(an(r) for r in ti_peach)},
    "cy_beltsville_or_greenbelt": {"count": len(belt_or_green_ans), "an": belt_or_green_ans},
    "cy_greenbelt": {"count": len(greenbelt), "an": sorted(an(r) for r in greenbelt)},
    "cy_beltsville_not_st_maryland": {"count": len(belt_not_maryland_ans), "an": belt_not_maryland_ans},
    "ti_technolog": {"count": len(ti_technolog), "an": sorted(an(r) for r in ti_technolog)},
    "cy_beltsvill_trunc": {"count": len(cy_beltsvill_trunc), "an": sorted(an(r) for r in cy_beltsvill_trunc)},
    "cy_beltsville_sorted_by_pn": {"count": len(belt_by_pn), "an": belt_by_pn},
    "cy_beltsville_sorted_by_in": {"count": len(belt_by_in), "an": belt_by_in},
    "kwic_9049442_ti_peach_14": kwic_9049442_ti_peach_14,
    "ti_fresh_w_water": {"count": len(ti_fresh_w_water), "an": sorted(an(r) for r in ti_fresh_w_water)},
    "rank_st_over_cy_beltsville": [[term, count] for term, count in rank_st_over_cy_beltsville],
    "rank_oc_over_cy_beltsville": [[term, count] for term, count in rank_oc_over_cy_beltsville],
}, indent=1))
