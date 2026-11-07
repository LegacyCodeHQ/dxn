# Files

**Status:** Decided

A file holds declarations, in the order they are written: enumerations, types
that vary over them, and records.

```dxn
enum Kind { primary, secondary }
enum State { normal, disabled }

type Button {
  varies Kind, State
}

record Review {
  kind: Kind
}
```

A file is checked as a whole. Each declaration is checked by its own rules: an
enumeration by those of [Enumerations](./enumerations), E1 to E4; a type by
those of [Types](./types), T1 to T3, against the file's enumerations; and a
record by those of [Records](./records), R1 to R6, and of
[Checks](./checks), C1 to C4, against the file's enumerations and records. The file adds a rule of its own: no two declarations
share a name.

The Lean specification in
[`lean/Dxn/File.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/File.lean)
is the source of truth. Where this page and the specification disagree, the
specification is right.

## Syntax

```text
file        = { declaration }
declaration = enumeration | type | record
```

A file is any number of declarations, of any kind, in any order. A type or a
record may name a declaration written before it or after it. A file with no
declarations is valid: nothing in it can be wrong. A syntax error in any
declaration stops reading the file there.

## Checker rules

| ID        | Rule                                          | Breaks it                                     | Reported                  |
| --------- | --------------------------------------------- | --------------------------------------------- | ------------------------- |
| E1–E4     | Each enumeration follows its own rules        | `enum Light { }`                              | `Light: empty`            |
| T1–T3     | Each type follows its own rules               | `type Button { varies Size }`, with no `Size` | `Button: noSuchEnum Size` |
| R1–R6     | Each record follows its own rules             | `record Review { reply: Review }`             | `Review: containsItself`  |
| C1–C4     | Each record's `check` block follows its rules | `check { }` twice                             | `Design: duplicateCheck`  |
| [F1](#f1) | No two declarations in a file share a name    | `enum Light { off }`<br>`type Light { }`      | `duplicateName Light`     |

A file is accepted exactly when it breaks none of them. Lean proves this
(`File.check_eq_nil_iff`).

A declaration's own problem is reported with the name of the declaration it
belongs to, such as `Light: empty`. Lean proves each is reported exactly when
that declaration has it (`File.enum_mem_check`, `File.type_mem_check`,
`File.record_mem_check`).

### F1: No two declarations in a file share a name {#f1}

```dxn
enum Light { off, on }
enum Light { dim }       -- Light is declared twice

enum Button { primary, secondary }
type Button { }          -- Button is declared twice, once of each kind
```

A name written twice is reported once, in the order it first appears, however
many times it is written, whatever kinds of declaration it names: an
enumeration, a type and a record may not share a name either.

**Why:** a name in the file must mean exactly one thing. Each value is tagged
with its enumeration's name, as in a
[disjoint union](../concepts/disjoint-unions), so two enumerations called
`Light` would share their tags, and their values would merge. A type and an
enumeration with the same name would leave `varies Button` unclear about which
it means. With names unique, no two enumerations in a file share a value. Lean
proves it (`File.nodup_values`).

**Suggest:** rename one of them, and point at every declaration with the name,
the first one included.

**Lean:** `File.duplicateName_mem_check` proves `duplicateName` is reported
exactly for each name written more than once.

## The order of reported problems

Each declaration's own problems come first, in the order the declarations are
written, whatever their kind, then F1 for each name written more than once, in
the order it first appears:

```dxn
enum light { }
type button { varies Size }
enum Power { on, on }
enum light { dim }
```

reports, in this order:

1. `light`: E1 `badEnumName light`, then E2 `empty`
2. `button`: T1 `badTypeName button`, then T2 `noSuchEnum Size`
3. `Power`: E4 `duplicate on`
4. `light`: E1 `badEnumName light`
5. F1 `duplicateName light`

Lean proves this order for every file:

| Fact                                                            | Lean                                  |
| --------------------------------------------------------------- | ------------------------------------- |
| A declaration's own problems come before every F1               | `File.check_sorted`                   |
| The declarations' own problems are each one's, in written order | `File.declProblemsOf_check`           |
| Under F1, names come in the order they are first written        | `File.duplicateNamesOf_check_sublist` |

When two declarations share a name, their problems are told apart by position:
point each problem at its own declaration.

## What an accepted file means

| Fact                                                                 | Lean                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Its values are every enumeration's values, in written order          | `File.values`                                                     |
| No two enumerations share a value, and none has a value twice        | `File.nodup_values`                                               |
| Each type's combinations are the product of its enumerations' values | `File.combinations`; see [Types](./types#combinations)            |
| Each record's values are the product of its fields' values           | `File.recordValues`; see [Records](./records#values-and-equality) |

## In Lean

A file, and its three kinds of declaration:

<<< lean:lean/Dxn/File.lean#file

Why the checker rejects a file:

<<< lean:lean/Dxn/File.lean#errors

The checker:

<<< lean:lean/Dxn/File.lean#check

What a valid file is:

<<< lean:lean/Dxn/File.lean#valid

## Implementation notes

- **Positions.** Point a declaration's problem at its own declaration, and F1
  at every declaration with the name.
- **Rule IDs.** Name the rule with each problem, such as `F1`.

## Decisions

| Decision                                                                              | Why                                                          | Rejected                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Two declarations in a file with the same name are a check error, whatever their kinds | A name means one thing; two enumerations' values would merge | Names unique only within each kind            |
| Each declaration's problems first, in written order, then names written twice         | Matches an enumeration, which reports its duplicates last    | Names written twice first                     |
| A file with no declarations is valid                                                  | Nothing in it can be wrong                                   |                                               |
| A type or record may name a declaration written after it                              | Order in a file means nothing                                | Declaring a name before anything that uses it |

## Deferred

| Question                                                                                                  | Decide when                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| May two different files each declare an enumeration with the same name? Then a value's tag needs its file | A model has more than one file |
