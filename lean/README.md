# dxn in Lean

A specification of the dxn language in [Lean 4](https://lean-lang.org). It
says what each construct means and which declarations the checker accepts, and
Lean proves the rules hold for every declaration, not only for examples.

The new implementation, in [`packages/next`](../packages/next), follows this
specification. Where the two disagree, the specification is right and the
implementation is fixed, or the specification is changed on purpose first.

## Layout

| Path             | Holds                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `Dxn/`           | The specification: definitions, the checker, and theorems about them    |
| `DxnTest/`       | Tests: concrete cases Lean checks with `#guard` and `example`           |
| `notes/`         | One document per construct: decisions, reasons and implementation notes |
| `DxnSpec.lean`   | The specification as a program, `dxn-spec`, for the agreement checks    |
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

## Agreement with the implementation

The proofs are about the specification's own definitions; the implementation
could change while they all still hold. The agreement checks connect the two:
the same declarations go through both, and they must say the same.

`lake exe dxn-spec <file>` reads declarations as JSON and writes, for each,
the problems `check` reports and, when it is accepted, its values:

```bash
make agreement
```

builds it and runs
[`packages/next/test/agreement`](../packages/next/test/agreement): the shared
cases in `cases.json`, each again with its values reversed, and 500 generated
ones. Each goes through the implementation's checker directly, and again as
text through its parser. They must agree on what is accepted, which problems
are reported for which names in which order, and which values an accepted
declaration has. Messages and positions belong to the implementation, and its
own tests cover them.

This tests agreement on those cases; it does not prove the implementation.
Add a case to `cases.json` for each new rule. `make agreement` needs Lean, so
it is not yet part of `make check`.

## Adding to it

- Decide first, then write the notes: the decision, the reason, and what is
  deferred.
- Write a failing test in `DxnTest/`, confirm `lake test` fails, then add the
  definitions and proofs to `Dxn/` until it passes.
- Keep one construct per module, and import each new module from `Dxn.lean`
  and `DxnTest.lean`.
- Extend `dxn-spec` and the agreement checks to the new construct.
- Use only Lean's own library; add Mathlib only when a construct needs it.
