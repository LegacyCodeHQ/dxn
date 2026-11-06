# dxn in Lean

A specification of the dxn language in [Lean 4](https://lean-lang.org). It
says what each construct means and which declarations the checker accepts, and
Lean proves the rules hold for every declaration, not only for examples.

The production implementation follows this specification. Where the two
disagree, the specification is right and the implementation is fixed, or the
specification is changed on purpose first.

## Layout

| Path             | Holds                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `Dxn/`           | The specification: definitions, the checker, and theorems about them    |
| `DxnTest/`       | Tests: concrete cases Lean checks with `#guard` and `example`           |
| `notes/`         | One document per construct: decisions, reasons and implementation notes |
| `lakefile.toml`  | The Lake project; `DxnTest` is its test driver                          |
| `lean-toolchain` | The pinned Lean version                                                 |

| Construct    | Specification                                  | Tests                                                  | Notes                                            |
| ------------ | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Finite sets  | [`Dxn/FiniteSet.lean`](Dxn/FiniteSet.lean)     | [`DxnTest/FiniteSet.lean`](DxnTest/FiniteSet.lean)     |                                                  |
| Names        | [`Dxn/Name.lean`](Dxn/Name.lean)               | [`DxnTest/Name.lean`](DxnTest/Name.lean)               | [`notes/enumerations.md`](notes/enumerations.md) |
| Enumerations | [`Dxn/Enumeration.lean`](Dxn/Enumeration.lean) | [`DxnTest/Enumeration.lean`](DxnTest/Enumeration.lean) | [`notes/enumerations.md`](notes/enumerations.md) |

## Using it

Install Lean with [elan](https://github.com/leanprover/elan); it reads the
version from `lean-toolchain`. Then, from this directory:

```bash
lake build
```

```bash
lake test
```

or `make lean` from the repository root. Both fail if a definition does not
compile, a proof does not hold, or a test does not pass.

## Reading a construct

For each construct, read three things together:

1. **The notes** say what was decided and why, and what the specification
   leaves out: the written syntax, error messages, fix suggestions, positions.
   They also list the questions deferred to later constructs.
2. **The specification** says exactly what a declaration means and what the
   checker accepts. A `def` is a rule. A `theorem` is a property any correct
   implementation has, such as "the checker accepts exactly the valid
   declarations".
3. **The tests** are concrete cases. An implementation's tests can reuse each
   one as it is.

The specification models the parsed form of a declaration, not its text. The
grammar is specified in the notes and checked by the implementation's grammar
tests.

## Adding to it

- Decide first, then write the notes: the decision, the reason, and what is
  deferred.
- Write a failing test in `DxnTest/`, confirm `lake test` fails, then add the
  definitions and proofs to `Dxn/` until it passes.
- Keep one construct per module, and import each new module from `Dxn.lean`
  and `DxnTest.lean`.
- Use only Lean's own library; add Mathlib only when a construct needs it.
