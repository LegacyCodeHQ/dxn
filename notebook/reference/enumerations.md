# Enumerations

**Status:** Decided

An enumeration names the values something can take:

```dxn
enum Light { off, on }
```

It defines a finite set with one element per name. For why that is, see
[Finite sets](../concepts/finite-sets). This page is the reference: how an
enumeration is written, every rule the checker applies, and what an accepted
enumeration means.

The Lean specification in
[`lean/Dxn/Enumeration.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/Enumeration.lean)
and
[`lean/Dxn/Name.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/Name.lean)
is the source of truth. Where this page and the specification disagree, the
specification is right.

## Syntax

```text
declaration = "enum" name "{" [ name { "," name } ] "}"
```

The values go on one line, or one per line, separated by commas:

```dxn
enum Light { off, on }

enum Light {
  off,
  on
}
```

The grammar reads any run of letters, digits, `-` and `_` as a name, including
letters from other alphabets. It reads more than the naming rules allow, so
the checker can report a bad name by name. It also reads empty braces, so the
checker can report an enumeration with no values.

### Syntax errors

These cannot be read at all, and reading stops at the first one:

| Written                             | Problem                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `enum Light { off, on, }`           | A trailing comma after the last value                   |
| `enum Light { off on }`             | No comma between two values                             |
| `enum Light { off, , on }`          | A comma with no value after it                          |
| `enum Light { off, on`              | No closing brace                                        |
| `enum Light off, on }`              | No opening brace                                        |
| `enum { off, on }`                  | No enumeration name                                     |
| `Light { off, on }`                 | No `enum` keyword                                       |
| `enum Button { enum Focus { on } }` | An enumeration inside another: enumerations do not nest |
| `enum Result { ok Int, error Int }` | A value with data after its name: values carry no data  |

## Checker rules

A declaration that reads is then checked. Each rule has an ID, which a
problem's report can name:

| ID        | Rule                                          | Breaks it                    | Reported            |
| --------- | --------------------------------------------- | ---------------------------- | ------------------- |
| [E1](#e1) | The enumeration name follows the naming rules | `enum light { off }`         | `badEnumName light` |
| [E2](#e2) | There is at least one value                   | `enum Light { }`             | `empty`             |
| [E3](#e3) | Every value name follows the naming rules     | `enum Light { Off }`         | `badValueName Off`  |
| [E4](#e4) | No value is written twice                     | `enum Light { on, off, on }` | `duplicate on`      |

In a file, no two enumerations may share a name: see [Files](./files), rule
[F1](./files#f1).

A declaration is accepted exactly when it breaks none of them. Lean proves
this (`check_eq_nil_iff`), and that each problem is reported exactly when its
rule is broken, never twice.

### E1: The enumeration name follows the naming rules {#e1}

An enumeration name is a capital letter, then letters and digits. It is ASCII.

| Accepted                                   | Rejected                                       |
| ------------------------------------------ | ---------------------------------------------- |
| `Light`, `UIState`, `HOVER`, `Light2`, `L` | `light`, `2Light`, `Li-ght`, `Li_ght`, `Lïght` |

**Why:** the case tells an enumeration from a value, so `Light` can never be
confused with `light`. ASCII, because look-alike letters from other alphabets
are different characters, and two names that look the same would not be.

No name follows both this rule and E3's, so a name's case alone says whether it
is an enumeration or a value. Lean proves it
(`not_isValueName_of_isEnumName`).

**Suggest:** for `light`, `Light`, capitalizing the first letter. For
`ui-state`, `UiState`, dropping the separator and capitalizing the next letter.
For `2Light` or `Lïght`, no name: say what the rule is.

**Lean:** `isEnumName`; `isEnumName_iff` proves it matches the rule as written
here, and `badEnumName_mem_check` that `badEnumName` is reported exactly when
it is broken.

### E2: There is at least one value {#e2}

`enum Theme { dark }` is accepted: one value is enough. `enum Light { }` is
not.

**Why:** an enumeration with no values is the empty set, $\emptyset$, and a
dimension with no values makes every count of combinations $0$. One value is
allowed, since a dimension that does not vary yet is still a valid model.

**Suggest:** add at least one value.

**Lean:** `empty_mem_check`.

### E3: Every value name follows the naming rules {#e3}

A value name is lowercase letters and digits, with single hyphens only between
them. It may start with a digit, or be only digits. It is ASCII.

| Accepted                                        | Rejected                                            |
| ----------------------------------------------- | --------------------------------------------------- |
| `off`, `no-keyboard`, `19px`, `2`, `700`, `a-1` | `Off`, `a-`, `-a`, `a--b`, `-`, `no_keyboard`, `ön` |

Each bad name is reported once, in the order it is first written, however
many times it is written.

**Why:** with no capitals, two values never differ only in case. Hyphens read
as UI words do, as in CSS: `no-keyboard`. Digits first allow column counts,
weights and sizes: `2`, `700`, `19px`.

**Suggest:**

| Written             | Suggest                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `Off`, `noKeyboard` | `off`, `no-keyboard`: lowercase, a hyphen before each inner capital |
| `no_keyboard`       | `no-keyboard`                                                       |
| `dim-`, `-dim`      | `dim`                                                               |
| `a--b`              | `a-b`                                                               |
| `ön`                | No name: say names are ASCII                                        |

A suggestion must follow the naming rules itself, and must not be a value the
enumeration already has. Suggesting `off` for `Off` when `off` is declared
would trade one problem for E4; say so instead.

**Lean:** `isValueName`; `isValueName_iff` proves it matches the rule as written
here, `ascii_of_isValueName` that it accepts only ASCII, and
`badValueName_mem_check` that `badValueName` is reported exactly for each name
that breaks it.

### E4: No value is written twice {#e4}

**Why:** a set has no repeats, so $\{\mathit{on}, \mathit{off}, \mathit{on}\}$
is just $\{\mathit{off}, \mathit{on}\}$; a name written twice is almost always
a mistake. Rejecting it keeps the number of names written equal to the number
of values.

Each repeated name is reported once, in the order it is first written:
`{ on, off, on, dim, off, on }` reports `on`, then `off`.

**Suggest:** remove the later one, and point at every place it is written,
the first included.

**Lean:** `duplicate_mem_check` proves `duplicate` is reported exactly for each
name written more than once.

## The order of reported problems

Problems are reported in the order of their rules, E1 to E4, and within a rule
in the order the names are first written:

```dxn
enum light { Off, on, Off, dim- }
```

reports E1 `badEnumName light`, E3 `badValueName Off`, E3 `badValueName dim-`,
then E4 `duplicate Off`. A name that breaks two rules is reported for each.

Lean proves this order for every declaration processed by its specification's
checker. Changing that checker to violate the order would invalidate the proof.
The TypeScript implementation is checked separately by agreement tests; these
proofs do not establish its correctness:

| Fact                                                       | Lean                            |
| ---------------------------------------------------------- | ------------------------------- |
| Problems are sorted by rule: E1, then E2, then E3, then E4 | `check_sorted`                  |
| Within E3, names come in the order they are first written  | `badValueNamesOf_check_sublist` |
| Within E4, names come in the order they are first written  | `duplicatesOf_check_sublist`    |

"In the order they are first written" is a subsequence of the declaration's
names listed once each, in the order each first appears. The implementation
reports problems in the same order, and the agreement checks compare the two
directly.

## What an accepted enumeration means

| Fact                                                                                                                                   | Lean                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| It has one value per name: `Light` has 2                                                                                               | `Enum.card_elem`                                 |
| Each value is tagged with its enumeration: $(\mathit{Light}, \mathit{off})$                                                            | `Value`, `Enum.values`                           |
| Enumerations with different names share no value                                                                                       | `Enum.values_disjoint`                           |
| The written order means nothing: `{ off, on }` is `{ on, off }`, and reordering is the only change that keeps the enumeration the same | `same_of_perm`, `valid_of_perm`, `same_iff_perm` |

Tools still keep the written order: a formatter never reorders values, and
output lists them as written.

## In Lean

Why the checker rejects a declaration, one kind per rule:

<<< lean:lean/Dxn/Enumeration.lean#errors

What a valid declaration is:

<<< lean:lean/Dxn/Enumeration.lean#valid

The checker:

<<< lean:lean/Dxn/Enumeration.lean#check

The naming rules, checked one character at a time:

<<< lean:lean/Dxn/Name.lean#names

## Implementation notes

- **Positions.** The specification has no positions. Point each problem at
  the name it concerns, and E4 at every occurrence.
- **Rule IDs.** Reports show the rule in the message, such as `[E2]`,
  alongside the existing diagnostic code. CLI JSON exposes it as `rule`;
  language-server diagnostics expose it as `data.rule`. Syntax errors have no
  checker-rule ID. The ID identifies the corresponding section of this reference.
- **Suggestions.** Each rule above says what to suggest. The specification
  does not; a suggestion is the implementation's, and must itself be accepted.
  Reports include a safe replacement in the message, CLI JSON `suggestion`,
  and language-server `data.suggestion`. They do not apply edits. If the
  replacement would collide with an existing value in that enumeration or an
  enumeration name in the file, the report explains the collision instead.

## Decisions

| Decision                                                             | Why                                                                                                   | Rejected                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Written `enum Light { off, on }`                                     | Familiar from Rust, Swift, TypeScript and Java; braces match $\{\mathit{off}, \mathit{on}\}$          | `enum Light = off \| on`, `type`, `set`, `one of`   |
| Values may go one per line                                           | Diffs cleanly; a value can be commented out alone                                                     |                                                     |
| No trailing comma                                                    | One way to write a list                                                                               | Allowing `{ off, on, }`                             |
| Names carry no data: a value is only its name                        | Every enumeration is $1 + 1 + \cdots + 1$, a set of tags with nothing inside                          | Values carrying data, such as `ok Int \| error Int` |
| Enumerations do not nest: every one is declared at the top of a file | A value is tagged with its enumeration's name, which is then unique in the file without qualifying it | Nested enumerations, such as `Button.Focus`         |
| Order means nothing                                                  | A set has no order; giving it a meaning later breaks nothing                                          | Order as an ordinal, as in most languages           |
| The checker enforces the naming rules, not the grammar               | A bad name is reported by name, with what to write instead                                            | Separate tokens for each kind of name               |

## Deferred

| Question                                                                   | Decide when                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------- |
| How to write a value when its name alone is ambiguous, such as `Light.off` | Values are first used, in combinations or rules |
| May a value be named after a keyword, such as `enum`?                      | There are more keywords                         |

## Formatter

The redesigned formatter writes each enumeration on one line, with one space
inside its braces, a space after each comma, and a final newline. Empty braces
are written `{ }` so an invalid empty declaration is still formatable. It does
not reorder members or change names. It refuses malformed syntax. Formatting
is independent of semantic acceptance. This formatting policy adds no semantic
rule to the Lean model.
