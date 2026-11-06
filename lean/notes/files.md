# Files

Decisions and implementation notes for files. The Lean specification in
[`Dxn/File.lean`](../Dxn/File.lean) is the source of truth for what a file is
and what the checker accepts.

## What a file is

A file is its enumeration declarations, in written order:

```dxn
enum Light { off, on }
enum Power { off, on }
```

## Decisions

| Decision                                                                                       | Why                                                                            |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Two enumerations in a file with the same name are a check error                                | Values are tagged with their enumeration's name; two `Light`s would share them |
| The checker reports each enumeration's own problems in written order, then names written twice | Matches an enumeration, which reports its duplicates last                      |
| A file with no enumerations is valid                                                           | Nothing in it can be wrong                                                     |

## Where each rule lives

| Rule                                                        | Lean                                                | Tests               |
| ----------------------------------------------------------- | --------------------------------------------------- | ------------------- |
| A file is its declarations in written order                 | `File`, `File.names`                                |                     |
| What the checker accepts                                    | `File.Valid`, `File.check`; `File.check_eq_nil_iff` | `DxnTest/File.lean` |
| A name written twice is reported exactly when it is         | `File.duplicateEnum_mem_check`                      | `DxnTest/File.lean` |
| An enumeration's problem is reported exactly when it has it | `File.enum_mem_check`                               | `DxnTest/File.lean` |
| In a valid file no two enumerations share a value           | `File.values`, `File.nodup_values`                  | `DxnTest/File.lean` |

## Implementation notes

These are guidance; where one conflicts with the specification, the
specification wins.

### The order of reported problems

```dxn
enum light { }
enum Power { on, on }
enum light { dim }
```

reports, in this order: `light`'s bad name and no values, `Power`'s `on`
written twice, the second `light`'s bad name, then `light` declared twice.

An enumeration's problem says which enumeration by name. When two declarations
share a name, their problems are told apart by position: point each problem at
its own declaration.

### A name written twice

Point a duplicated enumeration name at every declaration that has it, the
first one included, as a duplicated value does.

## Deferred

| Question                                                                                                  | Decide when                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| May two different files each declare an enumeration with the same name? Then a value's tag needs its file | A model has more than one file |
