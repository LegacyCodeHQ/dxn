# Enumerations

Decisions and implementation notes for enumerations. The Lean specification in
[`Dxn/Enumeration.lean`](../Dxn/Enumeration.lean) and
[`Dxn/Name.lean`](../Dxn/Name.lean) is the source of truth for what a
declaration means and what the checker accepts. This document records why,
what the specification leaves out, and what an implementation needs to know.

## What an enumeration is

An enumeration defines a finite set by naming its elements:

```dxn
enum Light { off, on }
```

`Light` is the set `{off, on}`, with one element per name. Each value is
tagged with its enumeration's name, as in a disjoint union, so `Light`'s
`off` and `Power`'s `off` are different values.

## Decisions

| Decision                                                                    | Why                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Written `enum Light { off, on }`                                            | Familiar from Rust, Swift, TypeScript and Java; braces match `{off, on}` |
| Values may go one per line                                                  | Diffs cleanly; a value can be commented out alone                        |
| No trailing comma                                                           | One way to write a list                                                  |
| Names carry no data                                                         | Every enumeration is `1 + 1 + ⋯ + 1`; data is left open                  |
| At least one value                                                          | An empty dimension makes every combination count `0`                     |
| A single value is allowed                                                   | A dimension that does not vary yet is still a valid model                |
| A name written twice is a check error                                       | Almost always a mistake; the number of names written is then `\|A\|`     |
| Different enumerations are different sets, even with the same value names   | Values are tagged with their enumeration                                 |
| Order means nothing                                                         | A set has no order; adding a meaning later breaks nothing                |
| Enumeration names: a capital letter, then letters and digits                | Case tells an enumeration from a value                                   |
| Value names: lowercase letters and digits, single hyphens only between them | Two values never differ only in case; UI words read as in CSS            |
| A value name may start with a digit, or be only digits                      | Column counts, weights and sizes: `2`, `700`, `19px`                     |
| Names are ASCII                                                             | Look-alike characters from other alphabets are different names           |
| The checker enforces the naming rules, not the grammar                      | A bad name is reported by name, with what to write instead               |

## Where each rule lives

| Rule                                                     | Lean                                                                                        | Tests                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| A declaration is a name and value names in written order | `EnumDecl`                                                                                  |                            |
| Naming rules                                             | `isEnumName`, `isValueName`                                                                 | `DxnTest/Name.lean`        |
| The naming rules match their plain descriptions          | `isEnumName_iff`, `isValueName_iff`                                                         | `DxnTest/Name.lean`        |
| Names are ASCII                                          | `ascii_of_isEnumName`, `ascii_of_isValueName`                                               | `DxnTest/Name.lean`        |
| What the checker accepts                                 | `Valid`, `check`; `check_eq_nil_iff`                                                        | `DxnTest/Enumeration.lean` |
| Each problem is reported exactly when it holds           | `badEnumName_mem_check`, `empty_mem_check`, `badValueName_mem_check`, `duplicate_mem_check` | `DxnTest/Enumeration.lean` |
| No problem is reported twice                             | `nodup_check`                                                                               | `DxnTest/Enumeration.lean` |
| One element per name                                     | `Enum.card_elem`                                                                            | `DxnTest/Enumeration.lean` |
| Values are tagged; different enumerations share none     | `Value`, `Enum.values`, `Enum.values_disjoint`                                              | `DxnTest/Enumeration.lean` |
| Order means nothing                                      | `Same`, `same_of_perm`, `valid_of_perm`                                                     | `DxnTest/Enumeration.lean` |

Each theorem is a property the implementation must have. Each `#guard` in the
tests is a case the implementation's tests can reuse as it is.

## Implementation notes

These are not in the Lean specification. They are guidance; where one
conflicts with the specification, the specification wins.

### The grammar reads more than the naming rules allow

The grammar must accept a wider word than any name the checker allows, or the
checker never sees a bad name and cannot report it by name. Read any run of
letters, digits, `-` and `_`, including non-ASCII letters, as a name; the
checker then reports `light`, `no_keyboard` or `ön`.

A trailing comma, a missing brace or a missing comma are syntax errors, for
the grammar to report. An empty list, a repeated name and a bad name are check
errors.

### The order of reported problems

The checker reports every problem, each once, in this order:

1. a bad enumeration name;
2. no values;
3. bad value names, in the order they are first written;
4. names written more than once, in the order they are first written.

```dxn
enum light { Off, on, Off, dim- }
```

reports `badEnumName light`, `badValueName Off`, `badValueName dim-`, then
`duplicate Off`. Lean's `check` produces this order, and the tests check it,
but no theorem proves it. Report problems in the same order, so the output of
the implementation and of the specification can be compared as lists.

A name that is both bad and repeated is reported for each: `Off` above.

### Fix suggestions

The specification names a bad name but does not say what to write instead. The
implementation should, since the CLI says every fact and the next step:

| Problem                             | Example             | Suggest                                                             |
| ----------------------------------- | ------------------- | ------------------------------------------------------------------- |
| Enumeration name in lowercase       | `light`             | `Light`: capitalize the first letter                                |
| Enumeration name with `-`/`_`       | `ui-state`          | `UiState`: drop the separator, capitalize the next letter           |
| Enumeration name with a digit first | `2Light`            | No suggestion: say it must start with a capital letter              |
| Value name with capitals            | `Off`, `noKeyboard` | `off`, `no-keyboard`: lowercase, a hyphen before each inner capital |
| Value name with `_`                 | `no_keyboard`       | `no-keyboard`                                                       |
| Value name with a hyphen at an end  | `dim-`, `-dim`      | `dim`                                                               |
| Value name with doubled hyphens     | `a--b`              | `a-b`                                                               |
| Non-ASCII name                      | `ön`, `Éclair`      | No suggestion: say names are ASCII                                  |
| No values                           | `enum Light { }`    | Add at least one value                                              |
| A name written twice                | `{ on, off, on }`   | Remove the later `on`; point at both                                |

A suggestion must pass the naming rules itself, and must not collide with
another value of the same enumeration. Suggesting `off` for `Off` when `off` is
already declared would only trade one problem for a duplicate; say so instead.
Both are properties worth testing.

### Positions

The specification has no source positions. The implementation should point
each problem at the name it concerns, and a duplicate at every occurrence, the
first one included.

### Written order

Order means nothing to the meaning, but tools keep it: the formatter never
reorders values, and output lists them in written order.

## Deferred

| Question                                                                                                             | Decide when                                           |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Can enumerations nest, such as `Button.Focus`? Then a value's tag becomes a qualified path, and names need resolving | Modeling a file, or a type that contains declarations |
| Must enumeration names be unique in a file?                                                                          | Modeling a file of declarations                       |
| How to write a value when its name alone is ambiguous, such as `Light.off`                                           | Values are first used, in combinations or rules       |
| May a value be named after a keyword, such as `enum`?                                                                | There are more keywords                               |
| May names carry data, such as `ok Int \| error Int`?                                                                 | Revisited deliberately                                |
