# Types

**Status:** Decided

A type is something that varies. It lists the enumerations it varies over, and
its combinations are every way to pick one value of each:

```dxn
enum Kind { primary, secondary }
enum State { normal, disabled }

type Button {
  varies Kind, State
}
```

`Button` has $2 \cdot 2 = 4$ combinations. Why it is a product, and why the
count multiplies, is in [Cartesian products](../concepts/cartesian-products).

The Lean specification in
[`lean/Dxn/Type.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/Type.lean)
and
[`lean/Dxn/File.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/File.lean)
is the source of truth. Where this page and the specification disagree, the
specification is right.

## Syntax

```text
type = "type" name "{" [ "varies" name { "," name } ] "}"
```

A type names the enumerations it varies over, in order, separated by commas. A
type may vary over nothing:

```dxn
type Logo { }
```

A type may name an enumeration declared before it or after it in the file.

## Checker rules

A type is checked against the enumerations of its file:

| ID        | Rule                                        | Breaks it                     | Reported               |
| --------- | ------------------------------------------- | ----------------------------- | ---------------------- |
| [T1](#t1) | The type name follows the naming rules      | `type button { }`             | `badTypeName button`   |
| [T2](#t2) | Every listed enumeration exists in the file | `varies Size`, with no `Size` | `noSuchEnum Size`      |
| [T3](#t3) | No enumeration is listed twice              | `varies Kind, Kind`           | `duplicateVaries Kind` |

In a file, no two declarations of any kind share a name: see
[Files](./files), rule [F1](./files#f1).

A type is accepted exactly when it breaks none of them. Lean proves this
(`checkType_eq_nil_iff`), and that each problem is reported exactly when its
rule is broken.

### T1: The type name follows the naming rules {#t1}

A type name follows the same rule as an enumeration name,
[E1](./enumerations#e1): a capital letter, then letters and digits.

**Why:** the case tells a declaration from a value.

**Suggest:** the name E1 would suggest, such as `Button` for `button`.

**Lean:** `badTypeName_mem_checkType`.

### T2: Every listed enumeration exists in the file {#t2}

Each name a type varies over must be an enumeration of the same file. A type's
name does not count: a type varies over enumerations only. Each missing name
is reported once, in the order it is first written.

**Why:** a type's combinations are made of its enumerations' values; a name
with no values gives nothing to combine.

**Suggest:** the enumeration names there are, or declare the missing one.

**Lean:** `noSuchEnum_mem_checkType`.

### T3: No enumeration is listed twice {#t3}

**Why:** each part of a combination is one enumeration's value; listing an
enumeration twice adds a part with nothing new. Varying over the same values
twice, such as a foreground and a background colour, needs named dimensions,
which are deferred.

**Suggest:** remove the later one.

**Lean:** `duplicateVaries_mem_checkType`.

## The order of reported problems

Problems are reported in the order of their rules, T1 to T3, and within a rule
in the order the names are first written:

```dxn
type button { varies Size, Kind, Kind }
```

reports T1 `badTypeName button`, T2 `noSuchEnum Size`, then T3
`duplicateVaries Kind`. In a file, a type's problems come where the type is
written, among the other declarations' problems.

## Combinations

An accepted type's combinations are one value of each enumeration it varies
over, in the order they are listed, with the first enumeration changing
slowest. For `Button`:

| #   | Kind        | State      |
| --- | ----------- | ---------- |
| 1   | `primary`   | `normal`   |
| 2   | `primary`   | `disabled` |
| 3   | `secondary` | `normal`   |
| 4   | `secondary` | `disabled` |

Each part of a combination is a value tagged with its enumeration, as in a
[disjoint union](../concepts/disjoint-unions): $(\mathit{Kind}, \mathit{primary})$.

| Fact                                                                 | Lean                       |
| -------------------------------------------------------------------- | -------------------------- |
| The number of combinations is the product of the enumerations' sizes | `File.length_combinations` |
| No combination is listed twice                                       | `File.nodup_combinations`  |
| A type that varies over nothing has one combination                  | `product`                  |

The order is how combinations are listed, not part of what they mean: the same
combinations listed another way are the same type.

## In Lean

A type:

<<< lean:lean/Dxn/Type.lean#type

Why the checker rejects a type:

<<< lean:lean/Dxn/Type.lean#errors

The checker:

<<< lean:lean/Dxn/Type.lean#check

What a valid type is:

<<< lean:lean/Dxn/Type.lean#valid

Every combination, first list slowest:

<<< lean:lean/Dxn/Type.lean#product

A type's combinations in a file:

<<< lean:lean/Dxn/File.lean#combinations

## Implementation notes

- **Positions.** Point T1 at the type's name, and T2 and T3 at every place the
  name is listed.
- **Rule IDs.** Name the rule with each problem, such as `T2`.
- **Listing combinations.** List them in the order above, so output can be
  compared directly.

## Decisions

| Decision                                                            | Why                                                                               | Rejected                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| Each type lists what it varies over                                 | Everything about a type's combinations is in one place, exclusions later included | A named product shared by types         |
| The keyword is `type`                                               | Domain-free: it fits any system with states                                       | `component`, `thing`                    |
| A type varies over a list of enumerations                           | The simplest form; varying over the same enumeration twice is rare                | Named dimensions, until they are needed |
| A type may vary over nothing, with one combination                  | A thing that does not vary yet is still a valid model                             | Requiring at least one enumeration      |
| Combinations are listed in written order, first enumeration slowest | Predictable, and matches how the type is written                                  | Last enumeration slowest                |

## Deferred

| Question                                                                 | Decide when                      |
| ------------------------------------------------------------------------ | -------------------------------- |
| Combinations that do not exist, such as a tertiary button never disabled | Exclusion rules are designed     |
| Varying over the same enumeration twice, through named dimensions        | A model needs it                 |
| Sharing a list of enumerations across types                              | Repeating lists becomes a burden |
| What a type has besides what it varies over, such as states              | Types gain a body                |
