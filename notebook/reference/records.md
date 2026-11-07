# Records

**Status:** Decided

A record is a named group of typed fields: plain data that does not vary. It
is the shape of a fact someone records about the model, such as a review of a
combination. Why a record is a product, how its values compare, and how it
differs from a type is in [Named products](../concepts/named-products).

```dxn
enum Verdict { approved, changes }
enum Urgency { low, high }

record Decision { verdict: Verdict }

record Review {
  decision: Decision
  urgent: Urgency
}
```

A record may also say each of its values must be checked: see
[Checks](./checks), proposed. Who records a record, where recorded facts are
kept and which combination each is about are not decided yet: see
[Deferred](#deferred).

The Lean specification in
[`lean/Dxn/Record.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/Record.lean),
[`lean/Dxn/RecordValue.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/RecordValue.lean)
and
[`lean/Dxn/File.lean`](https://github.com/LegacyCodeHQ/dxn/blob/main/lean/Dxn/File.lean)
is the source of truth. Where this page and the specification disagree, the
specification is right.

## Syntax

```text
record = "record" name "{" [ field { newline field } ] "}"
field  = name ":" name
```

Each field is a name, a colon and the field's type, one field per line. A
field's type is an enumeration or another record of the file, declared before
or after it. A record with one field may sit on one line.

The grammar reads empty braces and any names, so the checker can report a
record with no fields or a badly named field, as it does for enumerations.

## Checker rules

| ID        | Rule                                                         | Breaks it                              | Reported                    |
| --------- | ------------------------------------------------------------ | -------------------------------------- | --------------------------- |
| [R1](#r1) | The record name follows the naming rules                     | `record review { … }`                  | `badRecordName review`      |
| [R2](#r2) | The record has at least one field                            | `record Approved { }`                  | `noFields`                  |
| [R3](#r3) | Every field name follows the naming rules for values         | `Verdict: Verdict`                     | `badFieldName Verdict`      |
| [R4](#r4) | No two fields share a name                                   | `verdict: Verdict` twice               | `duplicateField verdict`    |
| [R5](#r5) | Every field's type is an enumeration or a record of the file | `when: Timestamp`, with no `Timestamp` | `noSuchFieldType Timestamp` |
| [R6](#r6) | The record does not contain itself                           | `reply: Review` in `Review`            | `containsItself`            |

In a file, no two declarations of any kind share a name: see [Files](./files),
rule [F1](./files#f1).

A record is accepted exactly when it breaks none of them. Lean proves R1 to R5
are reported exactly when broken (`checkRecord_eq_nil_iff` and the
`…_mem_checkRecord` theorems), and that a file reports a record's problems
exactly when it has them (`File.record_mem_check`).

### R1: The record name follows the naming rules {#r1}

A record name follows the same rule as an enumeration name,
[E1](./enumerations#e1): a capital letter, then letters and digits.

**Why:** the case tells a declaration from a value or a field.

**Suggest:** the name E1 would suggest, such as `Review` for `review`.

**Lean:** `badRecordName_mem_checkRecord`.

### R2: The record has at least one field {#r2}

**Why:** a record with no fields can only say a fact was recorded, never what.
Coverage will already say whether a fact was recorded, and absence is
ambiguous: not yet recorded, or recorded as no.

**Suggest:** to record a yes or no, a field of an enumeration such as
`{ yes, no }`.

**Lean:** `noFields_mem_checkRecord`.

### R3: Every field name follows the naming rules for values {#r3}

A field name follows the rule for value names, [E3](./enumerations#e3):
lowercase letters and digits, with single hyphens only between them, such as
`verdict` or `reviewed-at`. Each bad name is reported once, in the order it is
first written.

**Why:** fields read like values; the case tells a field from a declaration.

**Suggest:** the name E3 would suggest, such as `verdict` for `Verdict`.

**Lean:** `badFieldName_mem_checkRecord`.

### R4: No two fields share a name {#r4}

**Why:** fields are found by name; two called `verdict` would leave which one
is meant unclear. Different records may use the same field name.

**Suggest:** rename one of them; point at every field with the name.

**Lean:** `duplicateField_mem_checkRecord`.

### R5: Every field's type is an enumeration or a record of the file {#r5}

A type's name does not count: a type describes cases, not data a field can
hold. Each missing name is reported once, in the order it is first written.

**Why:** a field's values are its type's values; a name with no values gives
the field nothing to hold.

**Suggest:** the enumeration and record names there are. When the name is a
type's, say so: "`Button` is a type; a field's type is an enumeration or a
record".

**Lean:** `noSuchFieldType_mem_checkRecord`.

### R6: The record does not contain itself {#r6}

A record may not have a field of its own type, nor reach itself through other
records:

```dxn
record Review {
  verdict: Verdict
  reply: Review          -- Review contains itself
}

record Note { review: Review }
record Review { note: Note }   -- each contains itself, through the other
```

Every record on the cycle is reported.

**Why:** to write one value, every field must be given, a nested record's
included. A record that contains itself can never be finished, so it has no
values: see
[Named products](../concepts/named-products#a-record-cannot-contain-itself).

**Suggest:** point at the fields that lead back, in order.

**Lean:** `File.containsItself` follows fields from record to record. A way
back visits each record at most once before it returns, so as many steps as
there are records suffice.

## The order of reported problems

A record's problems are reported in the order of their rules, R1 to R6, and
within a rule in the order the names are first written:

```dxn
record review {
  Bad: Missing
  Bad: Urgency
}
```

reports R1 `badRecordName review`, R3 `badFieldName Bad`, R4
`duplicateField Bad`, then R5 `noSuchFieldType Missing`. In a file, a record's
problems come where the record is written, among the other declarations'
problems.

## Values and equality

A record's values are every way to give each field a value, nested records
included: the product of its fields' values, with the parts named. A value is
written with its field names:

```text
{ verdict: approved, finding: { severity: major, area: colour } }
```

| Fact                                                                        | Lean                              |
| --------------------------------------------------------------------------- | --------------------------------- |
| A field is read by its name                                                 | `FieldValue.get`                  |
| A record's number of values is the product of its fields' numbers of values | `File.length_valuesWithin_record` |
| Two values of a record are equal exactly when every field is                | `FieldValue.record_eq_iff_get`    |

Equality goes field by field, through nested records down to enumeration
values, which are equal only when they are the same tagged value. The order
fields are written in plays no part.

## In Lean

A record:

<<< lean:lean/Dxn/Record.lean#record

Why the checker rejects a record:

<<< lean:lean/Dxn/Record.lean#errors

The rules checked on each record, R1 to R5:

<<< lean:lean/Dxn/Record.lean#check

What a valid record is:

<<< lean:lean/Dxn/Record.lean#valid

R6, a record containing itself:

<<< lean:lean/Dxn/File.lean#contains

A field's value, and reading a field:

<<< lean:lean/Dxn/RecordValue.lean#value

A record's values:

<<< lean:lean/Dxn/RecordValue.lean#values

## Implementation notes

- **Positions.** Point R1 at the record's name, R2 at its braces, R3 and R4 at
  every field with the name, R5 at every field with the type, and R6 at the
  fields that lead back.
- **Rule IDs.** Name the rule with each problem, such as `R5`.
- **Equality.** Compare record values field by field, never as serialized
  text: `{"a": …, "b": …}` and `{"b": …, "a": …}` are the same value.

## Decisions

| Decision                                                                 | Why                                                                                                                      | Rejected                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| A record is a named group of typed fields, plain data that does not vary | It is the shape of a recorded fact, not something with combinations                                                      |                                                                   |
| Fields go one per line, without commas                                   | A body of declarations has one per line, as a type's body does; lists of names use commas, as an enumeration's values do | Commas between fields                                             |
| A record with one field may sit on one line                              | It needs no separator; two or more do                                                                                    | An optional `;` between fields                                    |
| A field's type is an enumeration or another record; no scalars for now   | Records group related fields, nesting included; values are enumerations only, so a record's values are finite            | Scalars such as timestamps and text, until they are needed        |
| A record has at least one field                                          | A record with no fields can only say a fact was recorded, never what                                                     | Allowing it, with one value `{}`, as a type may vary over nothing |
| A record name follows the naming rule for declarations                   | The case tells a declaration from a value or a field                                                                     |                                                                   |
| A field name follows the naming rule for values                          | Fields read like values: `verdict`, `reviewed-at`                                                                        |                                                                   |
| No two fields in one record share a name                                 | Fields are found by name                                                                                                 |                                                                   |
| A record may not contain itself, directly or through other records       | It would have no possible values                                                                                         |                                                                   |

## Deferred

| Question                                                                       | Decide when                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| Actors: who records which record                                               | Recording facts is designed                 |
| Where recorded facts are kept, and how each says which combination it is about | Recording facts is designed                 |
| The rules for recorded facts                                                   | Recording facts is designed                 |
| Coverage: which combinations have facts recorded                               | Recording facts is designed                 |
| How recorded facts follow a rename                                             | Recording facts is designed                 |
| Scalars, such as timestamps and text                                           | A model needs a field that cannot be listed |
