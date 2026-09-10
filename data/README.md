Not committed. Populate with
`CRIS_ACQUISITION=<acquisition dir> python3 scripts/extract-corpus.py RG164.CRIS.FY94.txt.zip`.
Source: NARA series 6207709, NAID 1204533. CRIS_ACQUISITION names the
directory of a WACZ capture of that catalog download. Fixity is checked on
extraction. Without a capture,
download RG164.CRIS.FY94.txt.zip from <https://catalog.archives.gov/id/1204533>,
unzip it here, and check its sha256 against `nara.file.fy1994_fixity` in
`registry/evidence.json`.

RG310.CRIS.FY88.txt extracts the same way (`... extract-corpus.py
RG310.CRIS.FY88.txt.zip`; sha256 in `nara.file.fy1988_fixity`), but backs a
typed encoding profile only (`packages/cris-formatb/src/profiles.ts`'s
`fy1988`) -- the app never loads or serves its records, so it is not needed
to run `pnpm dev` or `pnpm load`.
