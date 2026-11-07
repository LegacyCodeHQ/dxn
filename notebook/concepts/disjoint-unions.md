# Disjoint unions

**Status:** Decided

Two enumerations can have values with the same name:

```dxn
enum Light { off, on }
enum Power { off, on }
```

`Light`'s `off` and `Power`'s `off` are different values. A _disjoint union_
puts sets together while keeping track of which set each element came from, so
elements with the same name never merge. In dxn, each value carries its
enumeration's name.

| In mathematics                                                       | In programming                                    |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| A pair $(\mathit{Light}, \mathit{off})$                              | `Light`'s `off`, as `Light.off` would say in full |
| The tag $\mathit{Light}$                                             | The enumeration a value belongs to                |
| A disjoint union                                                     | A tagged union, as in Rust or Swift `enum`s       |
| $(\mathit{Light}, \mathit{off}) \neq (\mathit{Power}, \mathit{off})$ | Values of different enumerations are never equal  |

## Pairs

A _pair_ $(a, b)$ is two things in order. Two pairs are equal only when both
parts are equal:

$$
(a, b) = (c, d) \quad \text{exactly when} \quad a = c \;\text{and}\; b = d
$$

The _product_ $X \times Y$ is every pair with its first part from $X$ and its
second from $Y$. With one element in $X$, it is a copy of $Y$ with that
element in front of each:

$$
\{\mathit{Light}\} \times \{\mathit{off}, \mathit{on}\} = \{(\mathit{Light}, \mathit{off}), (\mathit{Light}, \mathit{on})\}
$$

## Plain union and disjoint union

The _union_ $A \cup B$ is everything in $A$ or in $B$. An element in both
appears once, so the two sets merge where they overlap:

$$
\{\mathit{off}, \mathit{on}\} \cup \{\mathit{off}, \mathit{on}\} = \{\mathit{off}, \mathit{on}\}
$$

::: info Definition
The _disjoint union_ of sets puts a _tag_ on each element, saying which set it
came from, then takes the union of the tagged sets. In dxn, the tag is the
enumeration's name:

$$
(\{\mathit{Light}\} \times \mathit{Light}) \cup (\{\mathit{Power}\} \times \mathit{Power})
= \{(\mathit{Light}, \mathit{off}), (\mathit{Light}, \mathit{on}), (\mathit{Power}, \mathit{off}), (\mathit{Power}, \mathit{on})\}
$$
:::

No pair can come from both sides, since their tags differ, so nothing merges,
and the sizes add:

$$
|\mathit{Light} + \mathit{Power}| = |\mathit{Light}| + |\mathit{Power}| = 2 + 2 = 4
$$

## Values in dxn

Every value of a file is a pair of its enumeration's name and its own: the
file's values are the disjoint union of its enumerations. That is why two
enumerations in a file may not share a name, rule
[F1](../reference/files#f1). Two enumerations called `Light` would give the
same tags, and their values would merge.

It is also what changes when an enumeration is renamed: the tags change, and
no value's own name does.

## In Lean

A value is a pair of its enumeration's name and its own:

<<< lean:lean/Dxn/Enumeration.lean#value

A file's values are each enumeration's values, tagged:

<<< lean:lean/Dxn/File.lean#values

Lean proves that in a valid file no two enumerations share a value
(`File.nodup_values`).

## Notation

| Symbol       | Read as                                         | Example                                                                 |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| $(a, b)$     | the pair of $a$ and $b$                         | $(\mathit{Light}, \mathit{off})$                                        |
| $X \times Y$ | every pair from $X$ and $Y$                     | $\{\mathit{Light}\} \times \{\mathit{off}, \mathit{on}\}$               |
| $A \cup B$   | everything in $A$ or in $B$                     | $\{\mathit{off}\} \cup \{\mathit{on}\} = \{\mathit{off}, \mathit{on}\}$ |
| $A + B$      | the disjoint union: $A$ and $B$, tagged by side | $\|\mathit{Light} + \mathit{Power}\| = 4$                               |
