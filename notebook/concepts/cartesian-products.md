# Cartesian products

**Status:** Decided

Something can vary in more than one way at once. A lamp can be off or on, and
also run on mains or on battery:

```dxn
enum Light { off, on }
enum Power { mains, battery }
```

Every state the lamp can be in is one value of each: off on mains, off on
battery, on on mains, on on battery. The _Cartesian product_ is the set of
every such combination. Counting it says how many cases there are to check.
In dxn, a [type](../reference/types) lists the enumerations it varies over, and
its combinations are their product. A record is a product too, with its parts
named: see [Named products](./named-products).

| In mathematics                                             | In programming                                        |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| The product $\mathit{Light} \times \mathit{Power}$         | Every combination of a `Light` and a `Power`          |
| A pair $(\mathit{on}, \mathit{battery})$                   | One combination: a tuple, or a record with two fields |
| $\|\mathit{Light} \times \mathit{Power}\| = 2 \cdot 2 = 4$ | Four cases, as two nested loops visit                 |
| A factor with no elements                                  | No combinations at all                                |
| A factor with one element                                  | No more combinations than without it                  |

## The product of two sets

[Disjoint unions](./disjoint-unions) introduced pairs: two things in order,
equal only when both parts are equal.

::: info Definition
The _Cartesian product_ $A \times B$ is the set of every pair whose first part
is from $A$ and whose second part is from $B$:

$$
A \times B = \{(a, b) \mid a \in A,\; b \in B\}
$$
:::

For the lamp:

$$
\mathit{Light} \times \mathit{Power} = \{
(\mathit{off}, \mathit{mains}), (\mathit{off}, \mathit{battery}),
(\mathit{on}, \mathit{mains}), (\mathit{on}, \mathit{battery}) \}
$$

Laid out as a table, each cell is one pair:

|           | `mains`                          | `battery`                          |
| --------- | -------------------------------- | ---------------------------------- |
| **`off`** | $(\mathit{off}, \mathit{mains})$ | $(\mathit{off}, \mathit{battery})$ |
| **`on`**  | $(\mathit{on}, \mathit{mains})$  | $(\mathit{on}, \mathit{battery})$  |

## Counting combinations

Each element of $A$ is paired with every element of $B$: a row of $|B|$ pairs
for each of the $|A|$ elements. So:

$$
|A \times B| = |A| \cdot |B|
$$

For the lamp, $2 \cdot 2 = 4$. Adding a third value to `Power`, say `solar`,
adds a column, and the count becomes $2 \cdot 3 = 6$. The count grows by
multiplying, not adding: that is why the number of cases to check grows so
quickly as a thing varies in more ways.

## More than two sets

The product of three sets is every _triple_, one part from each, and so on for
more sets. Each combination is a _tuple_, with one part per set:

$$
A \times B \times C = \{(a, b, c) \mid a \in A,\; b \in B,\; c \in C\}
$$

The count is the product of the sizes:

$$
|A \times B \times C| = |A| \cdot |B| \cdot |C|
$$

With `enum Mode { day, night }` as well, the lamp has
$2 \cdot 2 \cdot 2 = 8$ combinations, such as
$(\mathit{on}, \mathit{battery}, \mathit{night})$.

## The order of the sets

$\mathit{Light} \times \mathit{Power}$ and $\mathit{Power} \times \mathit{Light}$
are not equal: one has $(\mathit{on}, \mathit{battery})$, the other
$(\mathit{battery}, \mathit{on})$, and pairs are ordered. But swapping the parts
of each pair is a [bijection](./bijections) between them:

$$
(a, b) \mapsto (b, a), \qquad A \times B \cong B \times A
$$

So the two describe the same combinations, listed with their parts in a
different order, and have the same number of them.

## A set with no elements

If any set has no elements, there are no combinations at all: there is no
element to put in that part of the tuple.

$$
A \times \emptyset = \emptyset, \qquad |A \times \emptyset| = |A| \cdot 0 = 0
$$

This is why an enumeration needs at least one value, rule
[E2](../reference/enumerations#e2). One empty enumeration would leave a thing
with no combinations to check, however many ways it varies.

## A set with one element

A set with one element adds a part to every tuple, but no new combinations:

$$
|A \times \{x\}| = |A| \cdot 1 = |A|
$$

Each $(a, x)$ matches exactly one $a$, so $A \times \{x\} \cong A$. This is why
an enumeration with a single value is allowed: `enum Theme { dark }` is a way a
thing could vary that does not vary yet, and it costs no extra cases.

## In Lean

The product of lists: every way to pick one element of each, in written order,
with the first list changing slowest.

<<< lean:lean/Dxn/Type.lean#product

Lean proves, for every list of lists:

| Idea                                               | Lean                        |
| -------------------------------------------------- | --------------------------- |
| The count is the product of the sizes              | `length_product`            |
| A factor with no elements leaves no combinations   | `product_eq_nil_of_nil_mem` |
| With no repeats in any factor, none in the product | `nodup_product`             |

A type's combinations are this product of its enumerations' values: see
[Types](../reference/types#combinations).

## Notation

| Symbol              | Read as                                            | Example                                           |
| ------------------- | -------------------------------------------------- | ------------------------------------------------- |
| $A \times B$        | the Cartesian product: every pair from $A$ and $B$ | $\mathit{Light} \times \mathit{Power}$            |
| $\{x \mid \ldots\}$ | the set of every $x$ such that …                   | $\{(a, b) \mid a \in A,\; b \in B\}$              |
| $(a, b, c)$         | a tuple: one part from each set, in order          | $(\mathit{on}, \mathit{battery}, \mathit{night})$ |
| $\cdot$             | times                                              | $\|A \times B\| = \|A\| \cdot \|B\|$              |
| $\emptyset$         | the empty set                                      | $A \times \emptyset = \emptyset$                  |
