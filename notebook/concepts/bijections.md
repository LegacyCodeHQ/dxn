# Bijections

**Status:** Decided

A refactoring changes how a model is written. Whether it also changes what
the model means is a question about its values: compare the values before with
the values after, through a function that says where each one went. A rename
is the refactoring whose function is a _bijection_: it loses nothing and
merges nothing.

| In mathematics              | In programming                                 |
| --------------------------- | ---------------------------------------------- |
| A function $f : A \to B$    | Where each value goes when the model changes   |
| A bijection                 | A rename: every value still there, none merged |
| Not one-to-one              | Two values merged into one: not a rename       |
| The inverse $f^{-1}$        | Undoing a rename by renaming back              |
| The composition $g \circ f$ | Two renames in a row, which are one rename     |
| The identity                | Renaming something to its own name             |

## Values carry their enumeration's name

A value is not just `off`: it is `Light`'s `off`. Each value is a pair of its
enumeration's name and its own, so two enumerations can both have an `off`
without sharing it:

$$
(\mathit{Light}, \mathit{off}) \neq (\mathit{Power}, \mathit{off})
$$

So renaming an enumeration changes every one of its values, though no value's
own name changes.

## Functions

::: info Definition
A _function_ $f : A \to B$ gives each element $a \in A$ exactly one element
$f(a) \in B$.
:::

A refactoring's function goes from the values before, $A$, to the values
after, $B$. Renaming `Light` to `Lamp` in `enum Light { off, on }` is

$$
f(\mathit{Light}, \mathit{off}) = (\mathit{Lamp}, \mathit{off}), \qquad
f(\mathit{Light}, \mathit{on}) = (\mathit{Lamp}, \mathit{on})
$$

and every value of any other enumeration goes to itself.

## Bijections

::: info Definition
A function $f : A \to B$ is a _bijection_ when it is:

- **one-to-one:** no two elements of $A$ go to the same element of $B$. If
  $f(x) = f(y)$, then $x = y$.
- **onto:** every element of $B$ is reached:
  $\forall b \in B,\; \exists a \in A,\; f(a) = b$.

Together, every element of $B$ is reached by exactly one element of $A$.
:::

One-to-one means nothing merges. Onto means nothing new appears. So a
bijection keeps the number of values, $|B| = |A|$, and every fact about an old
value is a fact about exactly one new value.

The rename above is a bijection. It is one-to-one, since two different values
keep different value names, and onto, since each new value comes from the old
value with the same value name.

### When renaming is not a bijection

Renaming `Light` to `Power` when `enum Power { off, on }` already exists would
send two different values to the same one:

$$
f(\mathit{Light}, \mathit{off}) = (\mathit{Power}, \mathit{off}) = f(\mathit{Power}, \mathit{off})
$$

That function is not one-to-one: `Light`'s values and `Power`'s would merge.
It is not a rename, so dxn refuses it.

## Equal is not the same as matched

Two sets can be matched one to one without being equal. $A \cong B$ says a
bijection between them exists:

- $\{\mathit{off}, \mathit{on}\} = \{\mathit{on}, \mathit{off}\}$: the same
  elements.
- $\{(\mathit{Light}, \mathit{off}), (\mathit{Light}, \mathit{on})\} \cong
  \{(\mathit{Lamp}, \mathit{off}), (\mathit{Lamp}, \mathit{on})\}$: different
  elements, matched one to one.
- $\{\mathit{off}, \mathit{on}\} \not\cong \{\mathit{on}\}$: two elements
  cannot be matched one to one with one.

For finite sets, $A \cong B$ holds exactly when $|A| = |B|$. A rename gives a
model whose values are not equal to the old ones, but are matched with them.

## Undoing a rename: the inverse

A bijection can be run backwards. Its _inverse_ $f^{-1} : B \to A$ sends each
element back to the one it came from:

$$
f^{-1}(\mathit{Lamp}, \mathit{off}) = (\mathit{Light}, \mathit{off})
$$

The inverse of a rename is a rename: renaming `Lamp` back to `Light` undoes
it.

## Renaming twice: composition

Two functions in a row, $f$ and then $g$, are their _composition_ $g \circ f$:

$$
(g \circ f)(a) = g(f(a))
$$

A composition of bijections is a bijection. So two renames in a row are one
rename: `Light` to `Lamp`, then `Lamp` to `Bulb`, is `Light` to `Bulb`.

## Renaming to the same name: the identity

The _identity_ sends every element to itself, $f(a) = a$. It is a bijection
that changes nothing. Renaming `Light` to `Light` is the identity.

## Notation

| Symbol        | Read as                               | Example                                                                |
| ------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| $f : A \to B$ | $f$ is a function from $A$ to $B$     | $f : \mathit{Light} \to \mathit{Lamp}$                                 |
| $f(a)$        | where $f$ sends $a$                   | $f(\mathit{Light}, \mathit{off}) = (\mathit{Lamp}, \mathit{off})$      |
| $\exists$     | there is                              | $\exists a \in A,\; f(a) = b$                                          |
| $\cong$       | can be matched one to one with        | $\{\mathit{off}, \mathit{on}\} \cong \{\mathit{dim}, \mathit{lit}\}$   |
| $f^{-1}$      | the inverse of $f$: $f$ run backwards | $f^{-1}(\mathit{Lamp}, \mathit{off}) = (\mathit{Light}, \mathit{off})$ |
| $g \circ f$   | $f$, then $g$                         | $(g \circ f)(a) = g(f(a))$                                             |
