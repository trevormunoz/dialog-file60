# Gleam 1.18 → strict TypeScript: interop notes

Researched 2026-09-12 against primary sources. These are the findings that shape
the facade/bundle design in the spec. Version-pinned claims; flag where docs are
silent.

## The load-bearing distinction (Gleam v1.13, 2025-10-19)

Gleam separates two things:

1. **Internal runtime representation** — raw `.toArray()`, `instanceof Some`,
   payload at `[0]`, snake_case instance fields, `$CustomType` base. Still works,
   but **declared off-limits**: "Formalising external APIs"
   (gleam.run/news/formalising-external-apis/) reserves the right to change it for
   performance.
2. **The formalised `$`-API** — generated helpers the compiler emits for every
   public type: `Module$Constructor(...)`, `Module$isVariant`, `Module$field`,
   plus `Option$isSome`/`Option$Some$0`, `Result$isOk`, `List$isNonEmpty`,
   `BitArray$BitArray`. This is the supported boundary.

**Implication for us:** marshal through the `$`-API, not raw fields. The spike's
`facade.ts` does this; Gleam's own `.d.mts` marks the raw accessors `@deprecated`,
so `tsc` enforces the rule.

## 1. TypeScript declarations — yes

`gleam.toml`:

```toml
[javascript]
typescript_declarations = true   # emits .d.mts siblings
```

No CLI flag. Caveats: generics can degrade to `any` in some positions; `Nil` →
`undefined` (not `void`); **must clean-rebuild** after first enabling it
(gleam-lang/gleam#4520 — stale build dir won't emit). Consume the generated
`.d.mts` instead of hand-written `@ts-expect-error`.

## 2. Boundary representations

- `Int`/`Float`→number, `Bool`→boolean, `String`→string, `Nil`→undefined,
  tuple→immutable JS array.
- `List(a)` → linked list (`Empty`/`NonEmpty`); has `.toArray()` (documented, so
  lower-risk), but prefer converting on the Gleam side via `gleam/javascript/array`.
- `Option(a)` → `Some`/`None` classes from `gleam/option`; unwrap via `$`-API
  `Option$isSome`/`Option$Some$0`, or convert Gleam-side.
- `Result` → `Ok`/`Error`, payload at `[0]`; use `Result$*` `$`-API.
- `BitArray` → construct from `Uint8Array` via `BitArray$BitArray(u8)`; read with
  `byteAt`/`rawBuffer`. **JS limit:** non-byte-aligned bit patterns are a compile
  error on JS; byte-aligned (`bytes-size(n)`) patterns are fine.
- Custom records → `$CustomType` subclasses, snake_case fields; use generated
  accessors.

Canonical doc: the Externals guide, gleam.run/documentation/externals/.

## 3. FFI

`@external(javascript, "./module.mjs", "func")`, path relative to the `.gleam`
file; type annotations mandatory; externals must be `.mjs` or an npm package.
Import the prelude as `../gleam.mjs` (build tool provides it — don't author it).
Don't rely on internal prelude layout.

## 4. Facade: hand-written vs. Gleam-side

A thin facade converting `List`→`Array` and `Option`→nullable is a legitimate,
common pattern. The more future-proof version does those conversions **on the
Gleam side** (public functions already return JS-friendly shapes), so the
compiled `.mjs` + `.d.mts` *are* the facade and stay type-checked. No official
"JS binding generator"; `@gleam-tools/ts` is a community option (evaluate before
depending). Design interop deliberately — don't just expose internal records.

## 5. Build output & distribution

`gleam build --target javascript` → `build/dev/javascript/<pkg>/<module>.mjs`
(+ `.d.mts`), with `prelude.mjs` once per project and deps as sibling dirs
(`../gleam_stdlib/...`). Because imports are **relative siblings**, you cannot
ship one `.mjs` — **bundle** the output (esbuild/vite/rollup) into a
self-contained artifact and point `package.json` `exports` at it. (No documented
official policy here; bundling is community practice — flagged.)

## 6. Testing / CI

`gleam test --target javascript` (gleeunit, Node runtime) for the engine; a
TS/vitest test against the bundled output for the boundary; `tsc --noEmit`
(strict) against the generated `.d.mts` to catch declaration regressions.

## Sources

- Externals guide — gleam.run/documentation/externals/ (reflects v1.13 `$`-API)
- "Formalising external APIs" — gleam.run/news/formalising-external-apis/ (v1.13.0, 2025-10-19)
- gleam.toml reference — gleam.run/documentation/gleam-toml-reference/
- Prelude runtime — github.com/gleam-lang/gleam/blob/main/compiler-core/templates/prelude.mjs
- Known issues — gleam-lang/gleam#4520 (stale build dir), #3742 (Nil→void)
- gleam_javascript/array — hexdocs.pm/gleam_javascript/gleam/javascript/array.html
