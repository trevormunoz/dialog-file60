#!/usr/bin/env python3
"""Extract one NARA zip member from the WACZ capture, verify fixity, unzip.
Usage: CRIS_ACQUISITION=<acquisition dir> python3 scripts/extract-corpus.py RG164.CRIS.FY94.txt.zip
   or: CRIS_ACQUISITION=<acquisition dir> python3 scripts/extract-corpus.py RG310.CRIS.FY88.txt.zip

CRIS_ACQUISITION is the directory of a WACZ capture of the NARA catalog
download; it holds the WARC under output/ and the payload fixity list under
validation/. A reader without a capture can download the file from the NARA
catalog (NAID 1204533) instead and check its sha256 against
registry/evidence.json. RG310.CRIS.FY88.txt backs a typed encoding profile
only (packages/cris-formatb/src/profiles.ts); the app never loads or serves
its records.
"""
import gzip, hashlib, json, os, re, sys, zipfile
from pathlib import Path

if "CRIS_ACQUISITION" not in os.environ:
    sys.exit("set CRIS_ACQUISITION to the acquisition directory; see the docstring")
ACQ = Path(os.environ["CRIS_ACQUISITION"])
WARCS = sorted(ACQ.glob("output/collections/*/archive/*.warc.gz"))
if not WARCS:
    sys.exit(f"no .warc.gz under {ACQ}/output/collections/*/archive/")
FIXITY = ACQ / "validation/payload-fixity.json"
OUT = Path(__file__).resolve().parent.parent / "data"

def find_payload(warc: Path, name: str) -> bytes | None:
    """The response record whose target URI ends in /<name>, or None if this WARC lacks it."""
    data = gzip.open(warc, "rb").read()
    pos = 0
    while True:
        i = data.find(b"WARC/1.", pos)
        if i < 0:
            return None
        j = data.find(b"\r\n\r\n", i)
        hdr = data[i:j].decode("latin-1")
        length = int(re.search(r"Content-Length: (\d+)", hdr).group(1))
        body = data[j + 4 : j + 4 + length]
        pos = j + 4 + length
        if "WARC-Type: response" in hdr and hdr.split("WARC-Target-URI: ")[1].split()[0].endswith("/" + name):
            return body[body.find(b"\r\n\r\n") + 4 :]

def main(name: str) -> None:
    fix = {p["filename"]: p for p in json.load(FIXITY.open())["payloads"]}
    want = fix[name]
    payload = None
    for warc in WARCS:  # a capture may span several WARC files; the member is in one of them
        payload = find_payload(warc, name)
        if payload is not None:
            break
    if payload is None:
        sys.exit(f"{name} not found in any of {len(WARCS)} WARC files")
    sha = hashlib.sha256(payload).hexdigest()
    if sha != want["sha256"] or len(payload) != want["captured_bytes"]:
        sys.exit(f"fixity mismatch: {sha} {len(payload)} vs {want}")
    OUT.mkdir(exist_ok=True)
    (OUT / name).write_bytes(payload)
    with zipfile.ZipFile(OUT / name) as z:
        (member,) = z.namelist()
        z.extract(member, OUT)
    size = (OUT / member).stat().st_size
    print(f"ok {name} sha256={sha} member={member} bytes={size}")
    if size % 82 != 0:
        sys.exit(f"member size {size} not a multiple of 82")

if __name__ == "__main__":
    main(sys.argv[1])
