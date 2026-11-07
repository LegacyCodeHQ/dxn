# Checks

**Status:** Proposed

A record's values are entries a maker records. A `check` block says each entry
must also be checked: a checker records a check of it, with the fields the
block declares.

```dxn
enum Fidelity { sketch, final }
enum Verdict { approved, changes }

record Design {
  fidelity: Fidelity

  check {
    verdict: Verdict
  }
}

record Note {
  fidelity: Fidelity
}
```

Each `Design` entry is made, then checked. A `Note` entry is made only. The
theory, entries and checks as functions and status as their images, is in
[Images of functions](../concepts/images-of-functions).

Who the maker and the checker are, where entries and checks are kept, and
which entry is current are not decided yet: see [Deferred](#deferred). Not
specified in Lean yet.

## Syntax

```text
record = "record" name "{" [ field { newline field } ] { check } "}"
check  = "check" "{" [ field { newline field } ] "}"
field  = name ":" name
```

The `check` block comes after the record's own fields. It always has braces.
Its fields are written as a record's are, one per line, each an enumeration or
a record of the file.

- **`check { }`**, with no fields: the checker records only that the entry was
  checked.
- **`check { … }`**, with fields: the checker records the fields.
- **No `check` block:** the record's entries are made only.

The grammar reads any number of `check` blocks, so the checker can report a
second one, [C1](#c1), as it reports a record with no fields.

## What a check holds

A check's value is the block's fields, a
[named product](../concepts/named-products):

$$
\mathit{CheckValue} \cong \mathit{Fields}
$$

With no fields, the product has one value, so a check of `check { }` says only
that the entry was checked:

$$
\mathit{CheckValue} \cong 1
$$

A check is not its value. It is a value recorded of one entry, so checks of
different entries are different checks, even when their values are equal, as
every check of `check { }` is. The same holds for entries: an entry is a
record's value about one combination, not the value alone.

That is why `check { }` is allowed, while a record with no fields is not
([R2](./records#r2)): that a check exists is what status needs.

The language gives the fields no meaning. It makes sure each holds a value of
its type, so `verdict` can only be `approved` or `changes`. What a value means,
such as `changes` meaning "draw it again", is for whoever reads the data.

## Status

Status comes from what the maker and the checker have recorded, never from
what a check says. For a checked record, a combination is:

| Maker         | Checker                        | Status  |
| ------------- | ------------------------------ | ------- |
| no entry      | no check                       | missing |
| current entry | no check                       | waiting |
| current entry | a check of an older entry only | stale   |
| current entry | a check of the current entry   | checked |

A check is always of an entry, so there is no row with a check and no entry.
Stale is waiting with a history: the entry was checked, then changed, and the
new entry has not been checked. Checked does not mean approved: whether it is
is in the check's fields.

An entry of a record with no `check` block is complete once it is made.

## Which entry a check is of

A record's value does not say which entry it is. Two combinations may each
have an entry with the value `{ fidelity: final }`: the values are
[equal](./records#values-and-equality), but checking one entry must not
check the other.

So an entry is at least the combination it is about and its value, and a check
is of that pair. A check of one combination's entry never counts for another
combination. If the maker records a different value for the same combination,
the earlier check is not of it, and the combination is stale.

If an entry's value changes and then changes back, from A to B and back to A,
whether the earlier check of A counts again depends on whether an entry is
only its combination and value, or also when it was recorded. That is deferred
with the order: see [Deferred](#deferred).

## Checker rules

Fields in a `check` block follow the rules for a record's fields:

| ID        | Rule                                                               | Breaks it                              | Reported                         |
| --------- | ------------------------------------------------------------------ | -------------------------------------- | -------------------------------- |
| [C1](#c1) | A record has at most one `check` block                             | `check { }` twice                      | `duplicateCheck`                 |
| [C2](#c2) | Every check field name follows the naming rules for values         | `Severity: Severity` in `check`        | `badCheckFieldName Severity`     |
| [C3](#c3) | No two check fields share a name                                   | `severity: Severity` twice in `check`  | `duplicateCheckField severity`   |
| [C4](#c4) | Every check field's type is an enumeration or a record of the file | `when: Timestamp`, with no `Timestamp` | `noSuchCheckFieldType Timestamp` |

A record's values are its own fields' values only. A check is a separate
value about an entry, not part of the record's value, so a record value nested
in another never includes a check. A check field may therefore name the record
it checks:

```dxn
record Design {
  fidelity: Fidelity

  check {
    snapshot: Design
  }
}
```

`snapshot` holds a value of `Design`'s own fields, which is finite, so
[R6](./records#r6), a record containing itself, does not follow check fields.

The record's fields and the check's fields are separate scopes: a check field
may share a name with a field of the record, such as `fidelity` in both, for
the maker's value and the checker's.

### C1: A record has at most one `check` block {#c1}

**Why:** a check is one record with one set of fields; two blocks would leave
which one applies unclear.

**Suggest:** merge the blocks' fields into one.

### C2: Every check field name follows the naming rules for values {#c2}

As [R3](./records#r3).

**Why:** check fields read like values, as a record's fields do.

**Suggest:** the name E3 would suggest, such as `severity` for `Severity`.

### C3: No two check fields share a name {#c3}

As [R4](./records#r4).

**Why:** fields are found by name.

**Suggest:** rename one of them; point at every check field with the name.

### C4: Every check field's type is an enumeration or a record of the file {#c4}

As [R5](./records#r5).

**Why:** a field's values are its type's values.

**Suggest:** the enumeration and record names there are.

## Decisions

| Decision                                                                   | Why                                                                                       | Rejected                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Checking is declared inside the record, in a `check` block                 | What is checked and how it is checked are read in one place                               | A separate check record that names the record it checks    |
| The block always has braces, empty or not                                  | One form for every check; empty braces say "checked, nothing more"                        | A bare `check` with no braces                              |
| A check has no built-in outcome: it holds only its fields                  | Whether a check approves is for whoever reads the data, in the model's own words          | A built-in `approved` or `rejected` outcome on every check |
| Status has four values: missing, waiting, stale, checked                   | They are what the language can tell from what was recorded                                | Approved and rejected as statuses                          |
| A check's fields never decide status                                       | The language gives them no meaning                                                        | Fields that affect status, such as "`changes` blocks"      |
| A check field's type is an enumeration or a record, as a record field's is | One way to write data                                                                     |                                                            |
| The maker and the checker are implicit                                     | Every record's entries are made; a `check` block adds a checker                           | Declaring actors on each record                            |
| A record's values never include checks; R6 does not follow check fields    | A check is a separate value about an entry; a check field naming its own record is finite | Extending R6 to check fields                               |
| A check field may share a name with a field of the record                  | The two are separate scopes: what the maker records and what the checker records          | Names unique across both, with a rule against reuse        |

## Deferred

| Question                                                            | Decide when                 |
| ------------------------------------------------------------------- | --------------------------- |
| Who the maker and the checker are, and whether they must differ     | Recording facts is designed |
| Where entries and checks are kept                                   | Recording facts is designed |
| Which entry is current: their order                                 | Recording facts is designed |
| Whether a check counts again when a value changes back, A to B to A | Recording facts is designed |
