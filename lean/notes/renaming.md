# Renaming an enumeration

Decisions and implementation notes for renaming an enumeration. The Lean
specification in [`Dxn/Rename.lean`](../Dxn/Rename.lean) is the source of
truth for when a rename is refused and what it does.

## What a rename is

A refactoring is described by a function from the old values to the new ones.
A rename is a refactoring whose function is a bijection: it loses nothing and
merges nothing. Renaming `Light` to `Lamp` keeps every value's name and changes
its tag:

```text
(Light, off) ↦ (Lamp, off)
(Light, on)  ↦ (Lamp, on)
```

In the text, only the enumeration's name changes:

```dxn
enum Light { off, on }   becomes   enum Lamp { off, on }
```

## Decisions

| Decision                                                  | Why                                                  |
| --------------------------------------------------------- | ---------------------------------------------------- |
| Refused while any file has problems                       | A rename goes from one valid model to another        |
| Refused when the new name breaks the naming rules         | The result would not be valid                        |
| Refused when no enumeration has the old name              | There is nothing to rename                           |
| Refused when another enumeration already has the new name | Their values would share tags and merge              |
| Every reason that applies is reported, in that order      | The CLI says every fact                              |
| Renaming an enumeration to its own name is allowed        | It is the identity: a bijection that changes nothing |

While the file has problems, that is the only reason given: the others are not
meaningful in a file the checker rejects.

## Where each rule lives

| Rule                                                       | Lean                                                    | Tests                 |
| ---------------------------------------------------------- | ------------------------------------------------------- | --------------------- |
| When a rename is refused, and why                          | `renameErrors`, `renameEnum`; `renameErrors_eq_nil_iff` | `DxnTest/Rename.lean` |
| A rename keeps the file valid                              | `valid_of_renameEnum`                                   | `DxnTest/Rename.lean` |
| Each value goes to its renamed value                       | `Value.renameEnum`, `values_of_renameEnum`              | `DxnTest/Rename.lean` |
| No two values go to the same one: the map is a bijection   | `injOn_of_renameEnum`                                   | `DxnTest/Rename.lean` |
| Only enumeration names change; values and their order stay | `decls_values_of_renameEnum`                            | `DxnTest/Rename.lean` |
| Renaming back undoes it                                    | `renameEnum_undo`                                       | `DxnTest/Rename.lean` |

## Implementation notes

These are guidance; where one conflicts with the specification, the
specification wins.

### Edits, not rewrites

A rename changes one name, so the language server sends one text edit: the
renamed enumeration's name, at its span. The CLI rewrites only that name in
the file, leaving the rest of the text, comments and spacing included, as it
was.

### Messages

| Reason            | Say                                                                              |
| ----------------- | -------------------------------------------------------------------------------- |
| `fileHasProblems` | The file has problems; fix them first. List them, as the checker does.           |
| `badEnumName`     | The new name breaks the naming rules, with the suggestion the checker would give |
| `noSuchEnum`      | No enumeration is called the old name; list the names there are                  |
| `enumExists`      | Another enumeration is already called the new name; point at it                  |

### Later

Nothing refers to an enumeration's name yet. Once something does, such as
`Light.off`, a rename must update every reference, and the specification must
prove the meaning still follows the bijection.

## Deferred

| Question                                                         | Decide when                    |
| ---------------------------------------------------------------- | ------------------------------ |
| With several files, is the new name checked against all of them? | A model has more than one file |
