# Records

**Status:** Proposed

A record is a named group of typed fields: plain data that does not vary. It
is the shape of a fact someone records about the model, such as a review of a
combination. Why a record is a product, and how it differs from a type, is in
[Named products](../concepts/named-products).

```dxn
enum Verdict { approved, changes }
enum Urgency { low, high }

record Decision { verdict: Verdict }

record Review {
  decision: Decision
  urgent: Urgency
}
```

This page is being decided one question at a time. Nothing here is specified in
Lean or implemented yet.

## Syntax

```text
record = "record" name "{" [ field { newline field } ] "}"
field  = name ":" name
```

Each field is a name, a colon and the field's type, one field per line. A
field's type is an enumeration or another record. A record with one field may
sit on one line.

A record has at least one field. The grammar reads empty braces, so the checker
can report a record with no fields, as it reports an enumeration with no
values.

## Decided

| Decision                                                                 | Why                                                                                                                                                                                                                                        | Rejected                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| A record is a named group of typed fields, plain data that does not vary | It is the shape of a recorded fact, not something with combinations                                                                                                                                                                        |                                                                   |
| Fields go one per line, without commas                                   | A body of declarations has one per line, as a type's body does; lists of names use commas, as an enumeration's values do                                                                                                                   | Commas between fields                                             |
| A field's type is an enumeration or another record; no scalars for now   | Records group related fields, nesting included; values are enumerations only, so a record's values are finite                                                                                                                              | Scalars such as timestamps and text, until they are needed        |
| A record with one field may sit on one line                              | It needs no separator; two or more do                                                                                                                                                                                                      | An optional `;` between fields                                    |
| A record has at least one field                                          | A record with no fields can only say a fact was recorded, never what: coverage already says that, and absence is ambiguous, not yet recorded or recorded as no. To record a yes or no, use a field of an enumeration such as `{ yes, no }` | Allowing it, with one value `{}`, as a type may vary over nothing |

## Proposed

| Decision                                                                                                   | Why                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A record name follows the naming rule for declarations: a capital letter, then letters and digits          | The case tells a declaration from a value or a field                                                              |
| A field name follows the naming rule for values: lowercase letters and digits, single hyphens between them | Fields read like values: `verdict`, `reviewed-at`                                                                 |
| A record may not contain itself, directly or through other records                                         | It would have no possible values: see [Named products](../concepts/named-products#a-record-cannot-contain-itself) |

## Still to decide

1. Actors: who records which record.
2. Where recorded facts are stored, and how one says which combination it is
   about.
3. The checker's rules, for declarations and for stored data.
4. Coverage: which combinations have facts recorded.
5. How renaming follows recorded facts.
