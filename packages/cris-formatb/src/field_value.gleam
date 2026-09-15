//// Join a field's fragments into ordered lexical byte values. Concatenate
//// raw columns 4-72, then trim each completed value once; interior padding is
//// retained rather than silently repaired. See record.ts:61-76.

import card_image.{type CardImageError}
import gleam/bit_array
import gleam/list
import source_record.{
  type FieldOccurrence, type Fragment, FieldOccurrence, MarkedValueStart,
  NonEmpty, TaggedStart, WrappedText,
}

/// Values in supplied order, retaining duplicates and empty values. Assembly
/// has already interpreted the profile marker into fragment variants; joining
/// follows those distinctions without reclassifying the source bytes.
/// A marked fragment drops exactly its first data byte.
pub fn field_values(
  occurrence: FieldOccurrence,
) -> Result(List(BitArray), CardImageError) {
  let FieldOccurrence(_, NonEmpty(first, rest)) = occurrence
  case fold_fragments([first, ..rest], []) {
    Error(reason) -> Error(reason)
    Ok(values_reversed) ->
      Ok(
        values_reversed
        |> list.reverse
        |> list.map(fn(chunks_reversed) {
          chunks_reversed
          |> list.reverse
          |> bit_array.concat
          |> card_image.trim_trailing_spaces
        }),
      )
  }
}

/// Join ALL fragments into a SINGLE value, treating every continuation as
/// wrapped text: a line-start marker byte is kept as DATA, never a value
/// boundary. This is the correct reading for SINGLE-VALUE fields (OB/AP/DE/PR/PB
/// and the scalar fields), where the profile marker never separates values — so a
/// 0xAC at a wrapped-line start is a data byte (a left-quote conversion artifact;
/// see the FY94 generalization finding), not a MarkedValueStart. Contrast
/// `field_values`, which honors the marker for MULTI-value fields (SC/PH/GH/PF,
/// the repeating columns). Interior padding is retained and the whole is trimmed
/// once, exactly as `field_values` does per value.
pub fn joined_value(
  occurrence: FieldOccurrence,
) -> Result(BitArray, CardImageError) {
  let FieldOccurrence(_, NonEmpty(first, rest)) = occurrence
  join_raw([first, ..rest], [])
}

fn join_raw(
  fragments: List(Fragment),
  chunks_reversed: List(BitArray),
) -> Result(BitArray, CardImageError) {
  case fragments {
    [] ->
      Ok(
        chunks_reversed
        |> list.reverse
        |> bit_array.concat
        |> card_image.trim_trailing_spaces,
      )
    [fragment, ..rest] ->
      // Every fragment's raw columns 4-72 verbatim -- a MarkedValueStart's first
      // byte (the marker) is kept as data here, unlike chunk_for's drop.
      case card_image.raw_columns(fragment.witness.bytes) {
        Error(reason) -> Error(reason)
        Ok(raw) -> join_raw(rest, [raw, ..chunks_reversed])
      }
  }
}

// Both the values and each value's chunks accumulate in reverse order.
fn fold_fragments(
  fragments: List(Fragment),
  values: List(List(BitArray)),
) -> Result(List(List(BitArray)), CardImageError) {
  case fragments {
    [] -> Ok(values)
    [fragment, ..rest] ->
      case chunk_for(fragment) {
        Error(reason) -> Error(reason)
        Ok(chunk) ->
          case fragment, values {
            WrappedText(_), [current, ..older] ->
              fold_fragments(rest, [[chunk, ..current], ..older])
            TaggedStart(_), _ | MarkedValueStart(_), _ ->
              fold_fragments(rest, [[chunk], ..values])
            // Assembly supplies a tagged opener; manually constructed occurrences
            // may start with WrappedText. Keep the fold total by opening a value.
            WrappedText(_), [] -> fold_fragments(rest, [[chunk]])
          }
      }
  }
}

fn chunk_for(fragment: Fragment) -> Result(BitArray, CardImageError) {
  case card_image.raw_columns(fragment.witness.bytes) {
    Error(reason) -> Error(reason)
    Ok(raw) ->
      case fragment {
        TaggedStart(_) | WrappedText(_) -> Ok(raw)
        MarkedValueStart(_) -> {
          let assert <<_marker, rest:bytes>> = raw
            as "raw_columns returns exactly 69 bytes"
          Ok(rest)
        }
      }
  }
}
