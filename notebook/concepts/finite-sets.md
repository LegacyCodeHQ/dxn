# Finite sets

**Status:** Decided

A finite set is a collection of distinct things that can be counted. It is the
idea behind an `enum`: an enumeration names every element of a finite set,
and the number of names is the number of elements.

| In mathematics                               | In programming                    |
| -------------------------------------------- | --------------------------------- |
| A finite set $\{\mathit{off}, \mathit{on}\}$ | `enum Light { off, on }`          |
| An element, $\mathit{on} \in \mathit{Light}$ | A value, `on`                     |
| Its cardinality, $\|\mathit{Light}\| = 2$    | The number of values              |
| Two names, two elements                      | No two values are the same value  |
| Nothing else is in the set                   | A `Light` is always `off` or `on` |

## Sets

A _set_ is a collection of distinct things, its _elements_. We write $a \in A$
for "$a$ is an element of $A$".

Two sets are equal when they have the same elements. So a set has no order and
no repeats:

$$
\{\mathit{off}, \mathit{on}\} = \{\mathit{on}, \mathit{off}\} = \{\mathit{on}, \mathit{off}, \mathit{on}\}
$$

## Finite sets

::: info Definition
A set $A$ is _finite_ with $n$ elements when its elements can be listed so
that every element appears exactly once:

$$
A = \{a_1, a_2, \ldots, a_n\}, \qquad a_i \neq a_j \text{ whenever } i \neq j
$$

The number $n$ is the set's _cardinality_, written $|A| = n$.
:::

## Enumerations

An enumeration defines a finite set by naming each element:

$$
\mathit{Light} = \{\mathit{off}, \mathit{on}\}
$$

The names define exactly that set only if two conditions hold:

1. **Distinct names are distinct elements:** $\mathit{off} \neq \mathit{on}$.
2. **Nothing else is in the set:** $\forall x \in \mathit{Light},\; x = \mathit{off} \lor x = \mathit{on}$.
   Every element of $\mathit{Light}$ is $\mathit{off}$ or $\mathit{on}$.

Together they give $|\mathit{Light}| = 2$: one element per name.

## A declaration and its set

A declaration is what is written: a list of names, in order, which could
repeat a name. The set is what the declaration means, and it has neither order
nor repeats.

dxn is stricter than the mathematics. In mathematics $\{\mathit{on}, \mathit{off}, \mathit{on}\}$ is
simply $\{\mathit{off}, \mathit{on}\}$; in dxn, a declaration that repeats a name is a check
error. It is not a syntax error, since the grammar reads the list fine; a
check after reading rejects it. With distinct names, the number of names
written is always the number of elements.

The same holds for order. The written order means nothing to the set, so
`enum Light { off, on }` and `enum Light { on, off }` declare the same
enumeration. Tools still keep the written order when they format or list
values.

## In Lean

A finite set is a list holding every value exactly once: `complete` says
nothing else is in the set, and `nodup` says every element appears once. Its
cardinality is the length of that list.

<<< lean:lean/Dxn/FiniteSet.lean#finite

Lean checks both conditions, and the count, for `Light`:

<<< lean:lean/DxnTest/FiniteSet.lean#light

## Notation

| Symbol    | Read as                       | Example                                 |
| --------- | ----------------------------- | --------------------------------------- |
| $\in$     | is an element of              | $\mathit{on} \in \mathit{Light}$        |
| $\forall$ | for every                     | $\forall x \in \mathit{Light}$          |
| $\lor$    | or (one side or both)         | $x = \mathit{off} \lor x = \mathit{on}$ |
| $\neq$    | is not equal to               | $\mathit{off} \neq \mathit{on}$         |
| $\|A\|$   | the number of elements of $A$ | $\|\mathit{Light}\| = 2$                |
