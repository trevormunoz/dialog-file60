# Fixture sources

fy94-9049442.bin: bytes 6810182–6820185 of RG164.CRIS.FY94.txt (lines 83052–83173), AN 9049442, extracted 2026-09-09.
Extraction: `dd if=data/RG164.CRIS.FY94.txt of=packages/cris-formatb/fixtures/fy94-9049442.bin bs=82 skip=83051 count=122`
sha256: 87a1e74c56dd20e5b05e95f19fdc84658ec6e652f686e6ed6acca0764cc7af76 (10,004 bytes)

fy88-9000001.bin was a synthetic stand-in, used until 2026-09-10, now gone.

fy88-9000001.bin: bytes 82–8281 of RG310.CRIS.FY88.txt (lines 2–101), AN 9000001, extracted 2026-09-10.
Extraction: `dd if=data/RG310.CRIS.FY88.txt of=packages/cris-formatb/fixtures/fy88-9000001.bin bs=82 skip=1 count=100`
sha256: c23dc35cc54dc0a6533e85d50028309bf64d11a278fd31b6d7f88ebffeb1ee54 (8,200 bytes)

## formatb.encoding.fy1988_sc_percent, measured over the whole file

Measured 2026-09-10 with a script (not committed) parsing every record in
data/RG310.CRIS.FY88.txt under the fy1988 profile and counting, for each SC value, how many
segments its raw text splits into at the 0xA0 0x02 separator: 32,016 records, 59,385 SC
values, all 59,385 splitting into exactly three segments (code, label, percent); zero
two-segment values and zero values splitting any other way.
