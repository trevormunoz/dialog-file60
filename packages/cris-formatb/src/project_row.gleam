import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rpa_attestation

pub type Provenance {
  Provenance(record_group: String, fiscal_year: Int)
}

pub fn provenance_of(path: String) -> Result(Provenance, Nil) {
  case rpa_attestation.corpus_fy_from_path(path) {
    None -> Error(Nil)
    Some(fy) -> {
      let base = last_segment(path)
      // Record group is the leading "RGnnn" token of the basename.
      case string.split(base, ".") {
        [rg, ..] -> Ok(Provenance(rg, fy))
        [] -> Error(Nil)
      }
    }
  }
}

fn last_segment(path: String) -> String {
  case string.split(path, "/") |> list.last {
    Ok(seg) -> seg
    Error(_) -> path
  }
}
