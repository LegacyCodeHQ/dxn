# Files

**Status:** Decided

A file is its enumerations, in the order they are written:

```dxn
enum Light { off, on }
enum Power { off, on }
```

It is checked as a whole. Each enumeration in it is checked by the rules of
[Enumerations](./enumerations), E1 to E4, and the file adds one rule of its
own: no two enumerations share a name.

The Lean specification in
[`lean/Dxn/File.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/File.lean)
is the source of truth. Where this page and the specification disagree, the
specification is right.

## Syntax

```text
file = { declaration }
```

A file is any number of enumeration declarations, one after another. A file
with none is valid: nothing in it can be wrong. A syntax error in any
declaration stops reading the file there.

## Checker rules

| ID        | Rule                                       | Breaks it                                    | Reported              |
| --------- | ------------------------------------------ | -------------------------------------------- | --------------------- |
| E1–E4     | Each enumeration follows its own rules     | `enum Light { }`                             | `Light: empty`        |
| [F1](#f1) | No two enumerations in a file share a name | `enum Light { off }`<br>`enum Light { dim }` | `duplicateEnum Light` |

A file is accepted exactly when it breaks none of them. Lean proves this
(`File.check_eq_nil_iff`).

An enumeration's own problem is reported with the name of the enumeration it
belongs to, such as `Light: empty`. Lean proves each is reported exactly when
that enumeration has it (`File.enum_mem_check`).

### F1: No two enumerations in a file share a name {#f1}

```dxn
enum Light { off, on }
enum Light { dim }       -- Light is declared twice
```

A name written twice is reported once, in the order it first appears, however
many times it is written.

**Why:** each value is tagged with its enumeration's name, so
$(\mathit{Light}, \mathit{off})$ is `Light`'s `off`. Two enumerations called
`Light` would share their tags, and their values would merge: the file would
no longer say which `Light` a value belongs to. With names unique, no two
enumerations in a file share a value. Lean proves it
(`File.nodup_values`).

**Suggest:** rename one of them, and point at every declaration with the name,
the first one included.

**Lean:** `File.duplicateEnum_mem_check` proves `duplicateEnum` is reported
exactly for each name written more than once.

## The order of reported problems

Each enumeration's own problems come first, in the order the enumerations are
written, then F1 for each name written more than once, in the order it first
appears:

```dxn
enum light { }
enum Power { on, on }
enum light { dim }
```

reports, in this order:

1. `light`: E1 `badEnumName light`, then E2 `empty`
2. `Power`: E4 `duplicate on`
3. `light`: E1 `badEnumName light`
4. F1 `duplicateEnum light`

When two declarations share a name, their problems are told apart by position:
point each problem at its own declaration.

## What an accepted file means

| Fact                                                          | Lean                |
| ------------------------------------------------------------- | ------------------- |
| Its values are every enumeration's values, in written order   | `File.values`       |
| No two enumerations share a value, and none has a value twice | `File.nodup_values` |

## In Lean

A file:

<<< lean:lean/Dxn/File.lean#file

Why the checker rejects a file:

<<< lean:lean/Dxn/File.lean#errors

The checker:

<<< lean:lean/Dxn/File.lean#check

What a valid file is:

<<< lean:lean/Dxn/File.lean#valid

## Implementation notes

- **Positions.** Point an enumeration's problem at its own declaration, and F1
  at every declaration with the name.
- **Rule IDs.** Name the rule with each problem, such as `F1`.

## Decisions

| Decision                                                                      | Why                                                              | Rejected                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Two enumerations in a file with the same name are a check error               | Values are tagged with their enumeration's name; two would merge | Allowing it, and telling them apart some other way |
| Each enumeration's problems first, in written order, then names written twice | Matches an enumeration, which reports its duplicates last        | Names written twice first                          |
| A file with no enumerations is valid                                          | Nothing in it can be wrong                                       |                                                    |

## Deferred

| Question                                                                                                  | Decide when                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| May two different files each declare an enumeration with the same name? Then a value's tag needs its file | A model has more than one file |
