# Fixture sources

fy94-9049442.bin: bytes 6810182–6820185 of RG164.CRIS.FY94.txt (lines 83052–83173), AN 9049442, extracted 2026-09-09.
Extraction: `dd if=data/RG164.CRIS.FY94.txt of=packages/cris-formatb/fixtures/fy94-9049442.bin bs=82 skip=83051 count=122`
sha256: 87a1e74c56dd20e5b05e95f19fdc84658ec6e652f686e6ed6acca0764cc7af76 (10,004 bytes)

fy88-9000001.bin: NOT a corpus slice. RG310.CRIS.FY88.txt was not present on the machine that
built this profile (2026-09-10), so this fixture is a synthetic reconstruction of AN
9000001's SC field alone, built from the byte-level transcription in the plan (spec section
6.1): a `$$` line, an `AN 9000001` line, and four SC lines carrying "XFRS / Forestry Related /
100%" then, opened by a 0xAC continuation, "S0613 / Other Western Conifers / 100%", each
code/label/percent separated by 0xA0 0x02, encoded to the same 82-byte line form as
fy94-9049442.bin. It exercises the fy1988 encoding profile's third-segment split
(packages/cris-formatb/src/record.ts) but does not stand in for a real record: no other field
of AN 9000001 is represented, and its byte offset within the real file is not known. Replace
it with a real `dd` slice once RG310.CRIS.FY88.txt can be extracted (scripts/extract-corpus.py);
test/archival/fy88-record.test.ts re-derives the same values from the real file when present,
independently of this fixture.
sha256: e9035b0a2cc070d53397ac698f86546e7404fa18d9655af04ea169ab9de19d55 (492 bytes)
