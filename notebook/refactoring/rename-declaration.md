# Renaming a declaration

**Status:** Decided

Renaming a declaration gives an enumeration, a type or a record a new name, and
everything that refers to it follows: a type that varies over an enumeration,
and a record field of an enumeration's or a record's type.

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

**In the text,** the declaration's name changes where it is declared, and
wherever it is referred to: in a type's `varies` list, and as a record field's
type. Values, their order, every other declaration's name, every field's own
name and everything else stay as they were.

| Renaming       | Also changes                              | Nothing refers to it yet     |
| -------------- | ----------------------------------------- | ---------------------------- |
| An enumeration | `varies` lists, record fields of its type |                              |
| A record       | Record fields of its type                 |                              |
| A type         |                                           | A type is named nowhere else |

**In the meaning,** renaming an enumeration changes every one of its values. A
value is a pair of its enumeration's name and its own, as in a
[disjoint union](../concepts/disjoint-unions), so the rename changes the tag of
each and no value's own name:

$$
(\mathit{Light}, \mathit{off}) \mapsto (\mathit{Glow}, \mathit{off}), \qquad
(\mathit{Light}, \mathit{on}) \mapsto (\mathit{Glow}, \mathit{on})
$$

Every other value goes to itself; renaming a type or a record changes no value.
This function is a [bijection](../concepts/bijections): nothing is lost and
nothing merges, so the model means what it meant, under a new name.

## When it is refused

A rename of `from` to `to` is refused for each of these reasons that applies,
in this order, and nothing changes:

| ID          | Refused when                                 | Example                                   | Reported           |
| ----------- | -------------------------------------------- | ----------------------------------------- | ------------------ |
| [RE1](#re1) | A file has problems                          | Renaming in a file with `enum Light { }`  | `fileHasProblems`  |
| [RE2](#re2) | The new name breaks the naming rules         | `Light` to `glow`                         | `badName glow`     |
| [RE3](#re3) | No declaration has the old name              | `Bulb` to `Glow`, with no `Bulb`          | `noSuchName Bulb`  |
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

The new name must follow the naming rule every declaration shares, as in
[E1](../reference/enumerations#e1), [T1](../reference/types#t1) and
[R1](../reference/records#r1): a capital letter, then letters and digits.

**Why:** the renamed declaration would be rejected by the checker.

**Do instead:** the name E1 would suggest, such as `Glow` for `glow`.

**Lean:** `badName_mem_renameErrors`.

### RE3: No declaration has the old name {#re3}

**Why:** there is nothing to rename.

**Do instead:** one of the declaration names there are; list them.

**Lean:** `noSuchName_mem_renameErrors`.

### RE4: Another declaration already has the new name {#re4}

Renaming `Light` to `Power` when `enum Power { off, on }` is declared would
give both enumerations the tags $(\mathit{Power}, \mathit{off})$ and
$(\mathit{Power}, \mathit{on})$, and their values would merge. That function is
not one-to-one, so it is not a rename. Renaming onto any declaration's name is
refused, whatever its kind: the result would break
[F1](../reference/files#f1).

Renaming a declaration to its own name is not refused: it is the identity, and
changes nothing.

**Why:** a rename never merges values, and a name never means two things.

**Do instead:** another name. Point at the declaration that has this one.

**Lean:** `nameExists_mem_renameErrors`.

## The promises

| Promise                                                  | Lean                         |
| -------------------------------------------------------- | ---------------------------- |
| A rename that is not refused keeps the model valid       | `valid_of_renameDecl`        |
| Each value goes to its renamed value                     | `values_of_renameDecl`       |
| No two values go to the same one: it is a bijection      | `injOn_of_renameDecl`        |
| Every enumeration keeps its values, in order             | `enums_values_of_renameDecl` |
| Every type varies over the same enumerations, renamed    | `types_of_renameDecl`        |
| Every record keeps its fields, each field's type renamed | `records_of_renameDecl`      |
| Which records contain themselves does not change         | `containsItself_rename`      |
| Renaming back undoes it: it is reversible                | `renameDecl_undo`            |
| Renaming to its own name gives back the model            | `renameDecl_self`            |
| Two renames in a row are one rename                      | `renameDecl_comp`            |

## In Lean

Why a rename is refused, one kind per reason:

<<< lean:lean/Dxn/Rename.lean#refusals

Where each name, declaration and value goes:

<<< lean:lean/Dxn/Rename.lean#map

The rename:

<<< lean:lean/Dxn/Rename.lean#rename

## Implementation notes

- **Edits.** A rename changes the declared name and every place that refers to
  it, so the editor gets one text edit for each. The command line rewrites only
  those names in the file, leaving the rest of the text as it was.
- **Refusal IDs.** Each refusal carries its ID in `rule`, such as `RE4`. The
  Lean executable emits the same ID, and the agreement checks compare it.
- **Messages.** Each reason above says what to do instead. Give the checker's
  problems for RE1, its suggestion for RE2, the names there are for RE3, and
  where the taken name is declared for RE4.

## Decisions

| Decision                                                       | Why                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| One rename for every kind of declaration                       | Names are unique across kinds, so the same rule and proofs cover them all |
| Refused while any file has problems, with that the only reason | A rename goes from one accepted model to another                          |
| Every reason that applies is given, in a fixed order           | The command line says every fact                                          |
| Refused onto a name any declaration has                        | Values would merge, or a name would mean two things                       |
| Everything that refers to the declaration follows the rename   | A rename must update every reference, or the model breaks                 |
| A record field keeps its own name; only its type follows       | A field's type names a declaration; its own name does not                 |
| Renaming to its own name is allowed                            | It is the identity: a bijection that changes nothing                      |

## Deferred

| Question                                                                                                                          | Decide when                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Renaming a field, or a value of an enumeration: today each is one edit inside its own declaration, since nothing refers to either | Something first refers to a field or a value, such as recorded facts or exclusions |
| With several files, is the new name checked against all of them?                                                                  | A model has more than one file                                                     |
| How a reference to a value, such as `Light.off`, follows a rename                                                                 | Something refers to a value                                                        |
| How recorded facts follow a rename                                                                                                | Recording facts is designed                                                        |
