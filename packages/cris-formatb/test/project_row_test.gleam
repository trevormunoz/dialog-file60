import assembly
import construct
import gleam/bit_array
import gleam/json
import gleam/list
import gleam/option
import gleam/string
import gleeunit/should
import project_row.{Provenance}
import source_record
import tally

pub fn provenance_from_rg164_fy94_test() {
  project_row.provenance_of("data/RG164.CRIS.FY94.txt")
  |> should.equal(Ok(Provenance("RG164", 94)))
}

pub fn provenance_from_rg310_fy88_test() {
  project_row.provenance_of("data/RG310.CRIS.FY88.txt")
  |> should.equal(Ok(Provenance("RG310", 88)))
}

pub fn provenance_none_when_no_fy_test() {
  project_row.provenance_of("data/whatever.txt") |> should.equal(Error(Nil))
}

// --- golden fixture ----------------------------------------------------------
// Reuses the served-line/wrapped-continuation builder pattern from
// construct_test.gleam / tally_test.gleam: a "$$" boundary line, then one or
// more 82-byte served lines per field (cols 1-2 tag, col 3 blank, value from
// col 4, space pad to 80, CRLF), assembled into a SuppliedRecord.

fn spaces(n: Int) -> BitArray {
  case n <= 0 {
    True -> <<>>
    False -> bit_array.append(<<0x20>>, spaces(n - 1))
  }
}

fn served_line_bytes(tag: String, value: BitArray) -> BitArray {
  let body = bit_array.concat([<<tag:utf8, 0x20>>, value])
  let pad = spaces(80 - bit_array.byte_size(body))
  bit_array.concat([body, pad, <<0x0d, 0x0a>>])
}

fn served_line(tag: String, value: String) -> BitArray {
  served_line_bytes(tag, <<value:utf8>>)
}

const data_width: Int = 69

fn chunk_bytes(bytes: BitArray, size: Int) -> List(BitArray) {
  case bit_array.byte_size(bytes) <= size {
    True -> [bytes]
    False -> {
      let assert Ok(head) = bit_array.slice(bytes, 0, size)
      let assert Ok(tail) =
        bit_array.slice(bytes, size, bit_array.byte_size(bytes) - size)
      [head, ..chunk_bytes(tail, size)]
    }
  }
}

fn wrapped_lines(tag: String, value: BitArray) -> List(BitArray) {
  case chunk_bytes(value, data_width) {
    [] -> [served_line_bytes(tag, <<>>)]
    [first, ..rest] -> [
      served_line_bytes(tag, first),
      ..list.map(rest, fn(chunk) { served_line_bytes("  ", chunk) })
    ]
  }
}

fn record_bytes(
  pairs: List(#(String, BitArray)),
) -> source_record.SuppliedRecord {
  let lines =
    [served_line("$$", ""), ..[]]
    |> list.append(list.flat_map(pairs, fn(p) { wrapped_lines(p.0, p.1) }))
  let bytes = bit_array.concat(lines)
  let assert Ok(supplied) =
    assembly.assemble(
      bytes,
      assembly.SourceBase("data/RG164.CRIS.FY94.txt", 1),
      0xAC,
    )
  supplied
}

// A minimal but fully-modeled, certifying FY94-shaped record: one aligned
// classification allocation (RP=R101, AC=A10500, CM=C10500, FS=F10500,
// CT=0100, PA=P10500, JC=J10500), plus PH/GH expansions for each of those six
// codes (RP/AC/CM/FS via PH, PA/JC via GH) so the intra-record decode join has
// something to find. RP="R101" canonicalizes to "101", which the FY94 table
// attests as "APPRAIS OF SOIL RES" (src/vocab_rpa.gleam:177).
fn golden_fields() -> List(#(String, BitArray)) {
  [
    #("AN", <<"9049442":utf8>>),
    #("PN", <<"1275-21000-008-00D":utf8>>),
    #("TI", <<"Watershed protection in irrigated agriculture":utf8>>),
    #("PS", <<"new":utf8>>),
    #("PT", <<"0":utf8>>),
    #("PI", <<"Univ of Georgia":utf8>>),
    #("CY", <<"Tifton":utf8>>),
    #("ST", <<"GEORGIA":utf8>>),
    #("IN", <<"Gaines T P":utf8>>),
    #("FY", <<"1994":utf8>>),
    #("OB", <<"Improve poultry yields":utf8>>),
    #("DE", <<"POULTRY FORESTRY":utf8>>),
    #("SF", <<"CRIS":utf8>>),
    #("RP", <<"R101":utf8>>),
    #("AC", <<"A10500":utf8>>),
    #("CM", <<"C10500":utf8>>),
    #("FS", <<"F10500":utf8>>),
    #("CT", <<"0100":utf8>>),
    #("PA", <<"P10500":utf8>>),
    #("JC", <<"J10500":utf8>>),
    #("PH", <<"R101":utf8, 0x20, 0x20, 0xA0, 0x02, "Watershed Protection":utf8>>),
    #("PH", <<"A10500":utf8, 0x20, 0x20, 0xA0, 0x02, "Forestry Related":utf8>>),
    #("PH", <<"C10500":utf8, 0x20, 0x20, 0xA0, 0x02, "Commodity Literal":utf8>>),
    #("PH", <<"F10500":utf8, 0x20, 0x20, 0xA0, 0x02, "Science Literal":utf8>>),
    #("GH", <<
      "P10500":utf8, 0x20, 0x20, 0xA0, 0x02, "Program Area Literal":utf8,
    >>),
    #("GH", <<
      "J10500":utf8, 0x20, 0x20, 0xA0, 0x02, "Joint Council Literal":utf8,
    >>),
  ]
}

pub fn row_of_golden_certified_fy94_test() {
  let supplied = record_bytes(golden_fields())
  let provenance = Provenance("RG164", 94)
  let result = construct.project_with_vintage(supplied, option.Some(94))
  let tier = tally.tier_of(result)
  let text =
    project_row.row_of(supplied, provenance, tier, result)
    |> json.to_string

  should.be_true(string.contains(text, "\"an\":\"9049442\""))
  should.be_true(string.contains(
    text,
    "\"title\":\"Watershed protection in irrigated agriculture\"",
  ))
  should.be_true(string.contains(text, "\"fiscal_year\":94"))
  should.be_true(string.contains(text, "\"tier\":\"certified\""))
  should.be_true(string.contains(text, "\"certified\":true"))
  should.be_true(string.contains(text, "\"problems\":[]"))
  should.be_true(string.contains(text, "\"rp_code\":\"R101\""))
  should.be_true(string.contains(text, "\"rp_label\":\"Watershed Protection\""))
  should.be_true(string.contains(text, "\"rp_attested\":\"attested\""))
  should.be_true(string.contains(
    text,
    "\"rp_canonical_label\":\"APPRAIS OF SOIL RES\"",
  ))
  should.be_true(string.contains(text, "\"ac_code\":\"A10500\""))
  should.be_true(string.contains(text, "\"ac_label\":\"Forestry Related\""))
  let objectives_bytes = <<"Improve poultry yields":utf8>>
  should.be_true(string.contains(
    text,
    "\"objectives_text\":\"Improve poultry yields\"",
  ))
  should.be_true(string.contains(
    text,
    "\"objectives_raw\":\""
      <> bit_array.base64_encode(objectives_bytes, True)
      <> "\"",
  ))
}

// Same record, but attested against FY90 (a corpus vintage the design spec
// says has NO warrant set — rpa_attestation.warrant_for(90) == NoWarrant), so
// the RP decode must read "no_warrant_set", a flagged statement of absence,
// never "not_attested".
pub fn row_of_no_warrant_set_when_fy90_test() {
  let supplied = record_bytes(golden_fields())
  let provenance = Provenance("RG164", 90)
  let result = construct.project_with_vintage(supplied, option.Some(90))
  let tier = tally.tier_of(result)
  let text =
    project_row.row_of(supplied, provenance, tier, result)
    |> json.to_string

  should.be_true(string.contains(text, "\"rp_attested\":\"no_warrant_set\""))
  should.be_true(string.contains(text, "\"rp_canonical_label\":null"))
}
