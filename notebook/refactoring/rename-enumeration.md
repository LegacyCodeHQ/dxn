# Renaming an enumeration

**Status:** Decided

Renaming an enumeration gives it a new name, and every type that varies over
it and every record field of its type follow:

```dxn
enum Light { off, on }               enum Glow { off, on }
type Lamp { varies Light }   becomes   type Lamp { varies Glow }
record Shot { light: Light }         record Shot { light: Glow }
```

It keeps every promise of [Refactoring](./). It is reversible: renaming back
gives back the model.

The Lean specification in
[`lean/Dxn/Rename.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/Rename.lean)
is the source of truth. Where this page and the specification disagree, the
specification is right.

## What it does

**In the text,** the enumeration's name changes where it is declared, wherever
a type varies over it, and wherever a record field has it as its type. The
values, their order, every type's and record's name, every field's name and
everything else stay as they were.

**In the meaning,** every value of the enumeration changes. A value is a pair
of its enumeration's name and its own, as in a
[disjoint union](../concepts/disjoint-unions), so the rename changes the tag of
each and no value's own name:

$$
(\mathit{Light}, \mathit{off}) \mapsto (\mathit{Lamp}, \mathit{off}), \qquad
(\mathit{Light}, \mathit{on}) \mapsto (\mathit{Lamp}, \mathit{on})
$$

Every value of every other enumeration goes to itself. This function is a
[bijection](../concepts/bijections): nothing is lost and nothing merges, so the
model means what it meant, under a new name.

## When it is refused

A rename of `from` to `to` is refused for each of these reasons that applies,
in this order, and nothing changes:

| ID          | Refused when                                 | Example                                   | Reported           |
| ----------- | -------------------------------------------- | ----------------------------------------- | ------------------ |
| [RE1](#re1) | A file has problems                          | Renaming in a file with `enum Light { }`  | `fileHasProblems`  |
| [RE2](#re2) | The new name breaks the naming rules         | `Light` to `lamp`                         | `badEnumName lamp` |
| [RE3](#re3) | No enumeration has the old name              | `Bulb` to `Glow`, with no `Bulb`          | `noSuchEnum Bulb`  |
| [RE4](#re4) | Another declaration already has the new name | `Light` to `Power`, with `Power` declared | `nameExists Power` |

A rename is done exactly when none applies. Lean proves this
(`renameErrors_eq_nil_iff`), that every reason that applies is given and no
other, none twice (`nodup_renameErrors`), and in this order
(`renameErrors_sorted`).

### RE1: A file has problems {#re1}

While any file has problems, a rename is refused, and this is the only reason
given: the others mean nothing in a model the checker rejects.

**Why:** a refactoring goes from one accepted model to another, never from a
broken one.

**Do instead:** fix the problems first. Say what they are, as the checker
does.

**Lean:** `renameErrors_of_not_valid`.

### RE2: The new name breaks the naming rules {#re2}

The new name must follow the rule for enumeration names,
[E1](../reference/enumerations#e1): a capital letter, then letters and digits.

**Why:** the renamed enumeration would be rejected by the checker.

**Do instead:** the name E1 would suggest, such as `Lamp` for `lamp`.

**Lean:** `badEnumName_mem_renameErrors`.

### RE3: No enumeration has the old name {#re3}

The old name must be an enumeration's. A type's name does not count: this
refactoring renames enumerations only.

**Why:** there is nothing to rename.

**Do instead:** one of the enumeration names there are; list them.

**Lean:** `noSuchEnum_mem_renameErrors`.

### RE4: Another declaration already has the new name {#re4}

Renaming `Light` to `Power` when `enum Power { off, on }` is declared would
give both enumerations the tags $(\mathit{Power}, \mathit{off})$ and
$(\mathit{Power}, \mathit{on})$, and their values would merge. That function is
not one-to-one, so it is not a rename. Renaming onto a type's name is refused
too. Either way, the result would break [F1](../reference/files#f1).

Renaming an enumeration to its own name is not refused: it is the identity,
and changes nothing.

**Why:** a rename never merges values.

**Do instead:** another name. Point at the declaration that has this one.

**Lean:** `nameExists_mem_renameErrors`.

## The promises

| Promise                                                                  | Lean                         |
| ------------------------------------------------------------------------ | ---------------------------- |
| A rename that is not refused keeps the model valid                       | `valid_of_renameEnum`        |
| Each value goes to its renamed value                                     | `values_of_renameEnum`       |
| No two values go to the same one: it is a bijection                      | `injOn_of_renameEnum`        |
| Only names change: every enumeration keeps its values, in order          | `enums_values_of_renameEnum` |
| Every type keeps its name and varies over the same enumerations, renamed | `types_of_renameEnum`        |
| Every record keeps its name and fields, each field's type renamed        | `records_of_renameEnum`      |
| Which records contain themselves does not change                         | `containsItself_rename`      |
| Renaming back undoes it: it is reversible                                | `renameEnum_undo`            |
| Renaming to its own name gives back the model                            | `renameEnum_self`            |
| Two renames in a row are one rename                                      | `renameEnum_comp`            |

## In Lean

Why a rename is refused, one kind per reason:

<<< lean:lean/Dxn/Rename.lean#refusals

Where each name, declaration and value goes:

<<< lean:lean/Dxn/Rename.lean#map

The rename:

<<< lean:lean/Dxn/Rename.lean#rename

## Implementation notes

- **Edits.** A rename changes the declared name, every place a type lists it
  and every record field of its type, so the editor gets one text edit for each. The command line rewrites
  only those names in the file, leaving the rest of the text as it was.
- **Refusal IDs.** Each shared refusal carries its ID in `rule`, such as
  `RE4`. The Lean executable emits the same ID, and agreement checks compare
  it. CLI JSON preserves it; LSP rename failures preserve the refusals in
  error data. Both interfaces display the shared refusal rather than assigning
  their own IDs.
- **Messages.** Each reason above says what to do instead. Give the checker's
  problems for RE1, its suggestion for RE2, the names there are for RE3, and
  where the taken name is declared for RE4.

## Decisions

| Decision                                                                            | Why                                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Refused while any file has problems, with that the only reason                      | A rename goes from one accepted model to another                              |
| Every reason that applies is given, in a fixed order                                | The command line says every fact                                              |
| Refused onto a name any declaration has, a type's included                          | Values would merge, or a name would mean two things                           |
| A type that varies over the enumeration follows the rename                          | A rename must update every reference, or the model breaks                     |
| A record field of the enumeration's type follows the rename, and keeps its own name | A field names the enumeration it holds; its own name is not the enumeration's |
| Renaming to its own name is allowed                                                 | It is the identity: a bijection that changes nothing                          |

## Deferred

| Question                                                          | Decide when                    |
| ----------------------------------------------------------------- | ------------------------------ |
| With several files, is the new name checked against all of them?  | A model has more than one file |
| How a reference to a value, such as `Light.off`, follows a rename | Something refers to a value    |
