# Named products

**Status:** Proposed

A record groups several pieces of data under one name, as a data class or a
struct does:

```dxn
record Review {
  verdict: Verdict
  urgent: Urgency
}
```

A review is a verdict and an urgency, together. Mathematically, a record is a
_named product_: a [Cartesian product](./cartesian-products) whose parts are
told apart by name rather than by position.

| In mathematics                         | In programming                                  |
| -------------------------------------- | ----------------------------------------------- |
| A named product                        | A record, a struct, a data class                |
| A part's name                          | A field                                         |
| A value of the product                 | An instance: one value for every field          |
| Equal when every part is equal         | Two instances are equal when every field is     |
| Parts told apart by name, not position | The order fields are written in does not matter |
| Sums and products                      | Enumerations and records: algebraic data types  |

## A product with named parts

Take two enumerations:

```dxn
enum Verdict { approved, changes }
enum Urgency { low, high }
```

A `Review` is one verdict and one urgency. Its possible values are every way to
pick one of each, the product of its fields' types:

$$
\mathit{Review} \cong \mathit{Verdict} \times \mathit{Urgency}
$$

::: tip What $\cong$ says here
$\cong$ is read "is isomorphic to": the two sides can be matched one to one, as
on [Bijections](./bijections). On its own, that only says they have the same
number of elements; `Review` would also match any other set of four things.

What makes `Review` the same shape as $\mathit{Verdict} \times \mathit{Urgency}$
is the particular matching: field by field. The `verdict` field corresponds to
the first part and `urgent` to the second, so a review's verdict can be read
off its pair and back, and changing one corresponds to changing the other.
Nothing is lost and nothing is added: a `Review` holds exactly what a pair of a
verdict and an urgency holds, part for part, with names in place of positions.
That is what it means for a record to be a product type.
:::

The difference from a tuple is how a part is found. In a tuple, by position:
the first part, the second. In a record, by name: the `verdict`, the `urgent`.
One review is written with its field names:

$$
r = \{\, \mathit{verdict} \mapsto \mathit{approved},\; \mathit{urgent} \mapsto \mathit{high} \,\}
$$

Read aloud: "$r$ is the review whose verdict is approved and whose urgency is
high."

- **$r =$** names this one review $r$, so it can be referred to.
- **The braces** hold the review's fields, one entry per field, separated by
  commas.
- **$\mapsto$** is read "maps to": the field's name is on its left and the
  value it holds on its right. $\mathit{verdict} \mapsto \mathit{approved}$ says
  the field `verdict` holds `approved`.

In code, it is the same as:

```text
{ verdict: approved, urgent: high }          // JSON, TypeScript
Review(verdict = approved, urgent = high)    // Kotlin
```

::: tip $\mapsto$ and $\to$
The two arrows work at different levels. $\to$ goes between sets:
$f : A \to B$ says what kind of thing goes in and comes out. $\mapsto$ goes
between single elements: $\mathit{verdict} \mapsto \mathit{approved}$ says
where this one element goes.
:::

::: info Definition
A value of a named product is a function from its field names to values, each
field's value taken from that field's type. The braces with $\mapsto$ list
what it gives for each field, so $r$ above is the same as:

$$
r(\mathit{verdict}) = \mathit{approved}, \qquad r(\mathit{urgent}) = \mathit{high}
$$
:::

## Equality

::: info Definition
Two values of a record are equal exactly when every field is equal:

$$
r = s \quad \text{exactly when} \quad r(f) = s(f) \;\text{for every field}\; f
$$
:::

It is the rule for [pairs](./disjoint-unions#pairs), with fields in place of
positions. Two reviews that agree on the verdict but not on the urgency are
different reviews:

$$
\{\, \mathit{verdict} \mapsto \mathit{approved},\; \mathit{urgent} \mapsto \mathit{high} \,\}
\;\neq\;
\{\, \mathit{verdict} \mapsto \mathit{approved},\; \mathit{urgent} \mapsto \mathit{low} \,\}
$$

What "every field is equal" means depends on the field's type:

- **An enumeration's value** is equal to another exactly when both are the same
  tagged value, as in a [disjoint union](./disjoint-unions): the same
  enumeration and the same name. `Light`'s `off` is never `Power`'s `off`.
- **A record's value** is compared the same way, field by field. Equality goes
  down through records inside records until it reaches enumeration values.

Since fields are found by name, the order they are written in plays no part.
Two values that give the same fields the same values are equal, however their
fields are ordered when written down.

Equality is what lets the tools tell recorded facts apart: whether a fact
repeats one already recorded, which combinations have facts at all, and that a
refactoring keeps facts that were different still different. It is defined
here once, and everything that compares record values uses it.

## The order of the fields

Since parts are found by name, the order the fields are written in does not
change what a record is:

```dxn
record Review {          record Review {
  verdict: Verdict         urgent: Urgency
  urgent: Urgency          verdict: Verdict
}                        }
```

Both have the same values. Choosing an order for the fields turns a named
product into an ordinary tuple, and back:

$$
\{\, \mathit{verdict} \mapsto v,\; \mathit{urgent} \mapsto u \,\} \;\mapsto\; (v, u)
$$

That is a [bijection](./bijections): a named product and the tuples of its
fields in some order hold exactly the same information.

## Counting values

When every field's type is an enumeration, a record has as many possible
values as the product of their sizes, as combinations do:

$$
|\mathit{Review}| = |\mathit{Verdict}| \cdot |\mathit{Urgency}| = 2 \cdot 2 = 4
$$

### A record with no fields

A product of nothing has exactly one value: the record with no fields, `{}`.
It is the opposite of an enumeration with no values, which has none. A record
with one value carries no information of its own: recording it can only say
that something was recorded, never what. That is why dxn requires a record to
have at least one field; see [Records](../reference/records).

## Records and types

A record's fields are enumerations, as a type varies over enumerations. So
both are products of finite sets, and both have a finite number of values. As
sets, they are the same kind of thing. What separates them is what they are
for:

|                     | A type                                        | A record                                         |
| ------------------- | --------------------------------------------- | ------------------------------------------------ |
| Its values are      | the cases the model has to cover              | the possible answers written down about one case |
| Every value matters | yes: each combination is a case to check      | no: a review is one verdict, not every verdict   |
| Its parts are found | by position, in the order it varies over them | by name, as fields                               |

A type's combinations are listed because each one is a case that has to be
covered. A record's values are never listed as cases: nobody needs every
possible review, only the one that was written down. That is what it means for
a record not to vary. A type says which cases exist; a record says what is
written down about one of them.

## Records inside records

A field can itself be a record. Then the record's values are a product of
products:

```dxn
enum Severity { minor, major }
enum Area { layout, colour }

record Finding {
  severity: Severity
  area: Area
}

record Review {
  verdict: Verdict
  finding: Finding
}
```

$$
\mathit{Review} \cong \mathit{Verdict} \times \mathit{Finding}
\cong \mathit{Verdict} \times (\mathit{Severity} \times \mathit{Area})
$$

A product of products matches the flat product of all their parts by a
bijection, which only regroups them:

$$
(A \times B) \times C \;\cong\; A \times (B \times C) \;\cong\; A \times B \times C
$$

So nesting groups related fields under a name without changing what can be
recorded.

## A record cannot contain itself

Suppose a review's comment could be another review:

```dxn
record Review {
  verdict: Verdict
  reply: Review
}
```

To write one review, every field must be given, its reply included. That reply
is a review, whose own reply must be given, and so on without end. No review
can ever be finished, so there are none:

$$
\mathit{Review} \cong \mathit{Verdict} \times \mathit{Review} \quad\text{has no values}
$$

It is the same reason an enumeration with no values is rejected: a set with
nothing in it describes nothing. The same holds when a record contains itself
through others, such as a `Review` holding a `Finding` that holds a `Review`.

## Sums and products

An [enumeration](./finite-sets) is a choice: one value of several, a sum, as
in [disjoint unions](./disjoint-unions). A record is a combination: a value for
every field, a product. Together, sums and products describe the shapes of
data in most languages:

| Shape     | In dxn         | Elsewhere                       |
| --------- | -------------- | ------------------------------- |
| A sum     | an enumeration | an enum, a sealed class         |
| A product | a record       | a struct, a data class, a tuple |

Types built from sums and products are called _algebraic data types_: sums add
the number of values, and products multiply them.

### The algebraic data types dxn has

A dxn enumeration is a sum whose alternatives carry nothing: each name is a
set with one element, so $\mathit{Light} \cong 1 + 1$. That is the simplest
algebraic data type, an _enumerated type_. What dxn does not have is a sum
whose alternatives carry data, such as `enum Shape { Circle(f64), Square(f64) }`
in Rust: in dxn, a value carries no data.

So products can hold sums, but sums cannot hold products:

| Combination                                         | In dxn                                                          |
| --------------------------------------------------- | --------------------------------------------------------------- |
| A sum of plain names                                | Yes: an enumeration                                             |
| A product of sums                                   | Yes: a record with enumeration fields, or a type's combinations |
| A product of products                               | Yes: a record inside a record                                   |
| A sum of products: an alternative carrying a record | No: a value carries no data                                     |

dxn has algebraic data types, in a restricted form: everything is built by
multiplying sums of plain names.

## Notation

| Symbol                            | Read as                                               | Example                                                                                         |
| --------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| $\{\, f \mapsto v,\; \ldots \,\}$ | the record value with field $f$ set to $v$, and so on | $\{\, \mathit{verdict} \mapsto \mathit{approved},\; \mathit{urgent} \mapsto \mathit{high} \,\}$ |
| $r(f)$                            | the value of field $f$ in $r$                         | $r(\mathit{verdict}) = \mathit{approved}$                                                       |
| $\cong$                           | is isomorphic to: can be matched one to one with      | $\mathit{Review} \cong \mathit{Verdict} \times \mathit{Urgency}$                                |
