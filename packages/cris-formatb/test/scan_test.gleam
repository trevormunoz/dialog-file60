//// Scan fixed-width record spans and check byte-exact provenance.

import assembly
import card_image
import field_value
import gleam/bit_array
import gleam/list
import gleam/option.{None, Some}
import gleeunit/should
import record_model
import scan
import simplifile

fn line(prefix: BitArray) -> BitArray {
  let pad =
    list.repeat(<<32>>, times: 80 - bit_array.byte_size(prefix))
    |> bit_array.concat
  bit_array.concat([prefix, pad, <<13, 10>>])
}

pub fn scan_splits_records_between_header_and_trailer_test() {
  let header = line(<<"<< FY94":utf8>>)
  let trailer = line(<<">> END":utf8>>)
  let first =
    bit_array.concat([line(<<"$$":utf8>>), line(<<"AN 9049442":utf8>>)])
  let second =
    bit_array.concat([line(<<"$$":utf8>>), line(<<"AN 0000001":utf8>>)])
  let file = bit_array.concat([header, first, second, trailer])
  scan.scan(file, "F", 100)
  |> should.equal(
    Ok(scan.ScanResult(
      [
        scan.ScannedRecord(assembly.SourceBase("F", 101), first),
        scan.ScannedRecord(assembly.SourceBase("F", 103), second),
      ],
      scan.FileStructure(Some(header), Some(trailer)),
    )),
  )
}

pub fn scan_rejects_a_ragged_file_test() {
  scan.scan(<<0, 1, 2>>, "F", 1)
  |> should.equal(Error(card_image.LengthNotLineAligned(3)))
}

pub fn scanned_records_assemble_with_absolute_locations_test() {
  let header = line(<<"<<":utf8>>)
  let record_bytes =
    bit_array.concat([line(<<"$$":utf8>>), line(<<"AN 9049442":utf8>>)])
  let file =
    bit_array.concat([header, record_bytes, record_bytes, line(<<">>":utf8>>)])
  let assert Ok(scan.ScanResult(records, _)) = scan.scan(file, "F", 100)
  list.length(records) |> should.equal(2)
  list.each(records, fn(record) {
    let assert Ok(record_model.SuppliedRecord(
      witness,
      [record_model.Field(occ)],
    )) = assembly.assemble(record.bytes, record.base, 0xAC)
    witness.location
    |> should.equal(record_model.Location(
      "F",
      record.base.first_line,
      { record.base.first_line - 1 } * 82,
      164,
    ))
    witness.bytes |> should.equal(record_bytes)
    let assert record_model.NonEmpty(record_model.TaggedStart(an), []) =
      occ.fragments
    an.location |> should.equal(assembly.line_location(record.base, 1))
    field_value.field_values(occ)
    |> should.equal(Ok([<<"9049442":utf8>>]))
  })
}

pub fn empty_input_and_structure_only_files_test() {
  scan.scan(<<>>, "F", 1)
  |> should.equal(Ok(scan.ScanResult([], scan.FileStructure(None, None))))
  let header = line(<<"<<":utf8>>)
  let trailer = line(<<">>":utf8>>)
  scan.scan(bit_array.append(header, trailer), "F", 1)
  |> should.equal(
    Ok(scan.ScanResult([], scan.FileStructure(Some(header), Some(trailer)))),
  )
}

pub fn adjacent_separators_and_eof_close_records_test() {
  let separator = line(<<"$$":utf8>>)
  scan.scan(bit_array.append(separator, separator), "F", 9)
  |> should.equal(
    Ok(scan.ScanResult(
      [
        scan.ScannedRecord(assembly.SourceBase("F", 9), separator),
        scan.ScannedRecord(assembly.SourceBase("F", 10), separator),
      ],
      scan.FileStructure(None, None),
    )),
  )
}

pub fn unassigned_file_lines_are_skipped_but_still_counted_test() {
  let separator = line(<<"$$":utf8>>)
  let trailer = line(<<">>":utf8>>)
  let file =
    bit_array.concat([
      line(<<"AN preamble":utf8>>),
      separator,
      trailer,
      line(<<"AN after trailer":utf8>>),
      separator,
    ])
  scan.scan(file, "F", 1)
  |> should.equal(
    Ok(scan.ScanResult(
      [
        scan.ScannedRecord(assembly.SourceBase("F", 2), separator),
        scan.ScannedRecord(assembly.SourceBase("F", 5), separator),
      ],
      scan.FileStructure(None, Some(trailer)),
    )),
  )
}

// Even unexpected header placement must not compress the source span and
// shift the locations of subsequent lines. Matches offsets.ts's contiguous span.
pub fn header_inside_open_record_preserves_contiguous_source_bytes_test() {
  let header = line(<<"<< unexpected":utf8>>)
  let file =
    bit_array.concat([line(<<"$$":utf8>>), header, line(<<"AN 9049442":utf8>>)])
  scan.scan(file, "F", 20)
  |> should.equal(
    Ok(scan.ScanResult(
      [
        scan.ScannedRecord(assembly.SourceBase("F", 20), file),
      ],
      scan.FileStructure(Some(header), None),
    )),
  )
}

pub fn scan_the_fixture_yields_one_assemblable_record_test() {
  let assert Ok(bytes) = simplifile.read_bits("fixtures/fy94-9049442.bin")
  let assert Ok(scan.ScanResult([record], structure)) =
    scan.scan(bytes, "RG164.CRIS.FY94.txt", 83_052)
  record.base
  |> should.equal(assembly.SourceBase("RG164.CRIS.FY94.txt", 83_052))
  record.bytes |> should.equal(bytes)
  structure |> should.equal(scan.FileStructure(None, None))
  let assert Ok(record_model.SuppliedRecord(witness, parts)) =
    assembly.assemble(record.bytes, record.base, 0xAC)
  witness.bytes |> should.equal(bytes)
  witness.location
  |> should.equal(record_model.Location(
    "RG164.CRIS.FY94.txt",
    83_052,
    6_810_182,
    10_004,
  ))
  list.length(parts) |> should.equal(56)
  list.each(parts, fn(part) {
    let assert record_model.Field(occ) = part
    let assert Ok(_) = field_value.field_values(occ)
  })
}
