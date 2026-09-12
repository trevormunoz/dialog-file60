//// Spike: reimplement the Format B `scanRecords` in Gleam, JS target.
//// Mirrors packages/cris-formatb/src/offsets.ts scanRecords exactly enough to
//// test the facade's marshalling boundary (List, Option, BitArray, snake_case).

import gleam/bit_array
import gleam/javascript/array.{type Array as JsArray}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

// Parity trim. JS .trimEnd()/.trim() strip a different whitespace set than
// Gleam's string.trim_end/trim: JS strips U+00A0 (NBSP — the Format B separator
// lead byte) and not U+0085 (NEL); Gleam does the reverse. Input here is Latin-1,
// so every codepoint is <= U+00FF and the only JS-whitespace characters that can
// occur are the seven below (JS also strips U+2028/U+3000/U+FEFF etc., which no
// Latin-1 byte can produce). Matching that set keeps the oracle byte-identical to
// offsets.ts/record.ts without an FFI.
fn is_js_ws(g: String) -> Bool {
  case g {
    "\t" | "\n" | "\u{000B}" | "\u{000C}" | "\r" | " " | "\u{00A0}" -> True
    _ -> False
  }
}

fn drop_leading_ws(graphemes: List(String)) -> List(String) {
  case graphemes {
    [g, ..rest] ->
      case is_js_ws(g) {
        True -> drop_leading_ws(rest)
        False -> graphemes
      }
    [] -> []
  }
}

fn js_trim_end(s: String) -> String {
  s
  |> string.to_graphemes
  |> list.reverse
  |> drop_leading_ws
  |> list.reverse
  |> string.concat
}

fn js_trim(s: String) -> String {
  s
  |> string.to_graphemes
  |> drop_leading_ws
  |> list.reverse
  |> drop_leading_ws
  |> list.reverse
  |> string.concat
}

pub const line_bytes = 82

pub const data_start = 3

pub type RecordSpan {
  RecordSpan(
    first_line: Int,
    last_line: Int,
    offset: Int,
    length: Int,
    an: String,
  )
}

pub type FileStructure {
  FileStructure(header: Option(String), trailer: Option(String))
}

pub type ScanResult {
  ScanResult(spans: List(RecordSpan), structure: FileStructure, bad_lines: Int)
}

type Acc {
  Acc(
    spans: List(RecordSpan),
    open: Option(RecordSpan),
    bad_lines: Int,
    header: Option(String),
    trailer: Option(String),
  )
}

fn byte_at(bits: BitArray, i: Int) -> Int {
  case bit_array.slice(bits, i, 1) {
    Ok(<<b>>) -> b
    _ -> -1
  }
}

fn read_bytes_loop(bits: BitArray, i: Int, end: Int, acc: List(Int)) -> List(Int) {
  case i >= end {
    True -> list.reverse(acc)
    False -> read_bytes_loop(bits, i + 1, end, [byte_at(bits, i), ..acc])
  }
}

/// Latin-1: each byte value is its own Unicode codepoint, so the decode never
/// loses a byte (and every byte 0-255 is a single grapheme, so codepoint indices
/// line up with the TS UTF-16 indices splitSegments relies on).
fn latin1_raw(bits: BitArray, at: Int, len: Int) -> String {
  read_bytes_loop(bits, at, at + len, [])
  |> list.filter_map(string.utf_codepoint)
  |> string.from_utf_codepoints
}

/// Trimmed form, matching offsets.ts latin1(...).trimEnd().
fn latin1_slice(bits: BitArray, at: Int, len: Int) -> String {
  latin1_raw(bits, at, len) |> string.trim_end
}

fn char_of(b: Int) -> String {
  case string.utf_codepoint(b) {
    Ok(cp) -> string.from_utf_codepoints([cp])
    Error(_) -> ""
  }
}

fn close_open(acc: Acc, last_line: Int) -> Acc {
  case acc.open {
    Some(o) -> {
      let closed =
        RecordSpan(
          ..o,
          last_line: last_line,
          length: { last_line - o.first_line + 1 } * line_bytes,
        )
      Acc(..acc, spans: [closed, ..acc.spans], open: None)
    }
    None -> acc
  }
}

fn loop(bits: BitArray, n: Int, i: Int, base_line: Int, acc: Acc) -> Acc {
  case i >= n {
    True -> acc
    False -> {
      let at = i * line_bytes
      let b0 = byte_at(bits, at)
      let b1 = byte_at(bits, at + 1)
      let bad = case
        byte_at(bits, at + 80) == 0x0d && byte_at(bits, at + 81) == 0x0a
      {
        True -> acc.bad_lines
        False -> acc.bad_lines + 1
      }
      let acc = Acc(..acc, bad_lines: bad)
      let acc = case b0, b1 {
        0x3c, 0x3c -> Acc(..acc, header: Some(latin1_slice(bits, at, 80)))
        0x3e, 0x3e -> {
          let acc = close_open(acc, base_line + i - 1)
          Acc(..acc, trailer: Some(latin1_slice(bits, at, 80)))
        }
        0x24, 0x24 -> {
          let acc = close_open(acc, base_line + i - 1)
          let span =
            RecordSpan(
              first_line: base_line + i,
              last_line: base_line + i,
              offset: { base_line + i - 1 } * line_bytes,
              length: line_bytes,
              an: "",
            )
          Acc(..acc, open: Some(span))
        }
        _, _ ->
          case acc.open {
            Some(o) ->
              case o.an == "" && b0 == 0x41 && b1 == 0x4e {
                True ->
                  Acc(
                    ..acc,
                    open: Some(
                      RecordSpan(
                        ..o,
                        an: latin1_slice(
                          bits,
                          at + data_start,
                          line_bytes - 2 - data_start,
                        ),
                      ),
                    ),
                  )
                False -> acc
              }
            None -> acc
          }
      }
      loop(bits, n, i + 1, base_line, acc)
    }
  }
}

pub fn scan_records(bits: BitArray, base_line: Int) -> ScanResult {
  let n = bit_array.byte_size(bits) / line_bytes
  let acc = Acc(spans: [], open: None, bad_lines: 0, header: None, trailer: None)
  let acc = loop(bits, n, 0, base_line, acc)
  let acc = close_open(acc, base_line + n - 1)
  ScanResult(
    spans: list.reverse(acc.spans),
    structure: FileStructure(header: acc.header, trailer: acc.trailer),
    bad_lines: acc.bad_lines,
  )
}

/// JS-facing conversion done on the Gleam side: the linked `List` becomes a real
/// JS `Array`, so the TS facade never touches List internals. The `.d.mts` types
/// this as `Array(RecordSpan)` (a JS array), not a prelude `List`.
pub fn spans_array(result: ScanResult) -> JsArray(RecordSpan) {
  array.from_list(result.spans)
}

// ---------------------------------------------------------------------------
// parseRecord: record.ts port.
// ---------------------------------------------------------------------------

pub const data_end = 72

pub type Profile {
  Fy1988
  Fy1991plus
}

type Pcfg {
  Pcfg(continuation_byte: Int, sep_a: Int, sep_b: Int, percent_in_block: Bool)
}

fn profile_cfg(p: Profile) -> Pcfg {
  case p {
    Fy1988 -> Pcfg(0xac, 0xa0, 0x02, True)
    Fy1991plus -> Pcfg(0xac, 0xa0, 0x02, False)
  }
}

pub type SourceValue {
  SourceValue(
    raw: String,
    code: Option(String),
    label: Option(String),
    percent: Option(String),
    line: Int,
    offset: Int,
    continuation: Bool,
  )
}

pub type SourceField {
  SourceField(
    tag: String,
    values: List(SourceValue),
    line_start: Int,
    line_end: Int,
    offset: Int,
    length: Int,
  )
}

pub type LogicalRecord {
  LogicalRecord(
    file: String,
    first_line: Int,
    last_line: Int,
    offset: Int,
    length: Int,
    an: String,
    fields: List(SourceField),
    orphan_continuations: Int,
  )
}

type PAcc {
  PAcc(fields: List(SourceField), cur: Option(SourceField), orphans: Int)
}

/// Split raw at the first sep into code + rest; under percent_in_block, split
/// rest again so label stops before the percent. Mirrors record.ts splitSegments.
fn split_segments(v: SourceValue, cfg: Pcfg) -> SourceValue {
  let sep = char_of(cfg.sep_a) <> char_of(cfg.sep_b)
  case string.split_once(v.raw, sep) {
    Error(_) -> v
    Ok(#(before, rest)) -> {
      let code = js_trim_end(before)
      case cfg.percent_in_block, string.split_once(rest, sep) {
        True, Ok(#(lbl, pct)) ->
          SourceValue(
            ..v,
            code: Some(code),
            label: Some(js_trim_end(lbl)),
            percent: Some(js_trim(pct)),
          )
        _, _ ->
          SourceValue(
            ..v,
            code: Some(code),
            label: Some(js_trim_end(rest)),
          )
      }
    }
  }
}

fn new_value(raw: String, line: Int, continuation: Bool) -> SourceValue {
  SourceValue(
    raw: raw,
    code: None,
    label: None,
    percent: None,
    line: line,
    offset: { line - 1 } * line_bytes,
    continuation: continuation,
  )
}

fn close_cur(acc: PAcc) -> List(SourceField) {
  case acc.cur {
    Some(f) -> [SourceField(..f, values: list.reverse(f.values)), ..acc.fields]
    None -> acc.fields
  }
}

fn parse_loop(
  bits: BitArray,
  start: Int,
  n_lines: Int,
  i: Int,
  first_line: Int,
  cfg: Pcfg,
  acc: PAcc,
) -> PAcc {
  case i >= n_lines {
    True -> PAcc(..acc, fields: list.reverse(close_cur(acc)), cur: None)
    False -> {
      let line = first_line + i
      let at = start + i * line_bytes
      let tag = latin1_raw(bits, at, 2)
      let data_at = at + data_start
      let data_len = data_end - data_start
      let acc = case tag {
        "$$" -> acc
        "  " ->
          case acc.cur {
            None -> PAcc(..acc, orphans: acc.orphans + 1)
            Some(f) -> {
              let f = SourceField(
                ..f,
                line_end: line,
                length: { line - f.line_start + 1 } * line_bytes,
              )
              let f = case byte_at(bits, data_at) == cfg.continuation_byte {
                True ->
                  SourceField(..f, values: [
                    new_value(
                      latin1_raw(bits, data_at + 1, data_len - 1),
                      line,
                      True,
                    ),
                    ..f.values
                  ])
                False -> {
                  let extra = latin1_raw(bits, data_at, data_len)
                  case f.values {
                    [last, ..rest] ->
                      SourceField(..f, values: [
                        SourceValue(..last, raw: last.raw <> extra),
                        ..rest
                      ])
                    [] -> f
                  }
                }
              }
              PAcc(..acc, cur: Some(f))
            }
          }
        _ -> {
          let fields = close_cur(acc)
          let f =
            SourceField(
              tag: tag,
              values: [new_value(latin1_raw(bits, data_at, data_len), line, False)],
              line_start: line,
              line_end: line,
              offset: { line - 1 } * line_bytes,
              length: line_bytes,
            )
          PAcc(fields: fields, cur: Some(f), orphans: acc.orphans)
        }
      }
      parse_loop(bits, start, n_lines, i + 1, first_line, cfg, acc)
    }
  }
}

pub fn parse_record(
  bits: BitArray,
  span: RecordSpan,
  file: String,
  profile: Profile,
  buffer_base_line: Int,
) -> LogicalRecord {
  let cfg = profile_cfg(profile)
  let start = { span.first_line - buffer_base_line } * line_bytes
  let n_lines = span.length / line_bytes
  let acc =
    parse_loop(bits, start, n_lines, 0, span.first_line, cfg, PAcc([], None, 0))
  // trim + split every value (record.ts does this after the build loop)
  let fields =
    list.map(acc.fields, fn(f) {
      SourceField(
        ..f,
        values: list.map(f.values, fn(v) {
          split_segments(SourceValue(..v, raw: js_trim_end(v.raw)), cfg)
        }),
      )
    })
  LogicalRecord(
    file: file,
    first_line: span.first_line,
    last_line: span.last_line,
    offset: span.offset,
    length: span.length,
    an: span.an,
    fields: fields,
    orphan_continuations: acc.orphans,
  )
}

/// JS-facing List->Array conversions, done Gleam-side.
pub fn record_fields_array(r: LogicalRecord) -> JsArray(SourceField) {
  array.from_list(r.fields)
}

pub fn field_values_array(f: SourceField) -> JsArray(SourceValue) {
  array.from_list(f.values)
}
