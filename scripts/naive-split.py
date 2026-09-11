#!/usr/bin/env python3
"""Independent checker. Splits the raw file on CRLF+"$$", joins column 4-72 slices.
A leading 0xAC on a continuation line starts a new value (a separate repeating field
value, not more text appended to the value already open) -- see registry key
formatb.encoding.continuation_0xAC. No shared code with packages/cris-formatb.
Usage: python3 scripts/naive-split.py data/RG164.CRIS.FY94.txt > fixtures/acceptance-fy94.json
"""
import json, sys

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
}, indent=1))
