# Images of functions

**Status:** Proposed

An agent designs every combination of a button, and a person checks each
design:

```dxn
enum Kind { primary, secondary }
enum State { normal, disabled }

type Button {
  varies Kind, State
}
```

Three questions matter, in this order:

1. Which combinations have a design?
2. Which designs are waiting to be checked?
3. Which designs are checked?

An _entry_ is one fact the maker records: a value of a record, such as a
design, about one combination. The entry is not its value: two entries about
different combinations are different, even when their values are equal. A _check_ is one record the checker makes of an
entry, holding whatever the checker records. Each question is answered by following functions, from checks to the
entries they check, and from entries to the combinations they are about, and
asking what each function reaches.

| In mathematics                                            | In the example                                     |
| --------------------------------------------------------- | -------------------------------------------------- |
| A function from entries to combinations, $\mathit{about}$ | Each design is about one combination               |
| A function from checks to entries, $\mathit{of}$          | Each check is of one design                        |
| The image of a function                                   | The combinations that have a design                |
| $\mathit{about}$ is not onto                              | Combinations no design is about: gaps              |
| $\mathit{of}$ is not onto, so has no inverse              | A design may have no check yet                     |
| The composition of the two                                | A check is about a combination, through its design |

## Entries are about combinations

Each entry the maker records is about exactly one combination: this design is
of the primary, disabled button. That is a [function](./bijections#functions)
from entries to combinations:

$$
\mathit{about} : \mathit{Entries} \to \mathit{Combinations}
$$

Every entry has exactly one combination: an entry cannot be about nothing, or
about two cases at once. But a combination may have no entry yet.

## The image of a function

::: info Definition
The _image_ of a function $f : A \to B$ is every element of $B$ that some
element of $A$ goes to:

$$
f[A] = \{\, f(a) \mid a \in A \,\}
$$
:::

The image of $\mathit{about}$ is the combinations some entry is about: the ones
that have a design. Those outside it have none:

$$
\mathit{Combinations} \setminus \mathit{about}[\mathit{Entries}]
$$

That is _coverage_. When every combination has an entry, the image is all of
$\mathit{Combinations}$, and the function is _onto_, as on
[Bijections](./bijections#bijections). Coverage is complete exactly when
$\mathit{about}$ is onto.

## Checks are of entries

Each check is of exactly one entry, the design the checker looked at:

$$
\mathit{of} : \mathit{Checks} \to \mathit{Entries}
$$

That every check has its entry is what "no check without something made" means:
the function is defined for every check. An entry may have no check yet; it is
waiting.

## A function with no inverse

A [bijection](./bijections) can be run backwards, because it is one-to-one and
onto. Most functions are neither, and each failure says something:

| The function is not | So                                                             | In the example                                                         |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| onto                | some elements of $B$ are reached by nothing                    | combinations with no design; designs with no check                     |
| one-to-one          | some element of $B$ is reached by more than one element of $A$ | a combination designed more than once; a design checked more than once |

Neither $\mathit{about}$ nor $\mathit{of}$ has an inverse, so going backwards,
from a combination to its design or from a design to its check, may find
nothing. That is not a fault: what a function does not reach is exactly what
is still to be done.

## Following one function after another

The two functions chain, as renames do on [Bijections](./bijections):

$$
\mathit{Checks} \xrightarrow{\;\mathit{of}\;} \mathit{Entries} \xrightarrow{\;\mathit{about}\;} \mathit{Combinations}
$$

A check is about a combination through its entry: the composition
$\mathit{about} \circ \mathit{of}$. Its image is the combinations that have a
checked design.

## Status, from the chain

The images answer the three questions. Since neither function is one-to-one,
a combination's status comes from its _current_ entry:

| Status  | The combination                                                                    |
| ------- | ---------------------------------------------------------------------------------- |
| missing | is outside the image of $\mathit{about}$: no entry is about it                     |
| waiting | has a current entry outside the image of $\mathit{of}$, and no older one inside it |
| stale   | has a current entry no check is of, and an older entry a check is of               |
| checked | has a current entry inside the image of $\mathit{of}$: a check is of it            |

The checked combinations are an image too: of the checks of current entries,
under the composition,

$$
(\mathit{about} \circ \mathit{of})\,[\{\, c \in \mathit{Checks} \mid c \text{ is of a current entry} \,\}]
$$

A check of an entry that is no longer current does not count.

Which entry is current is not decided yet: it needs an order, such as the time
each was recorded.

## In Lean

Not specified yet. How a record declares that its entries are checked is in
[Checks](../reference/checks).

## Notation

| Symbol                | Read as                                            | Example                                                            |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| $f[A]$                | the image of $A$ under $f$: everything $f$ reaches | $\mathit{about}[\mathit{Entries}]$                                 |
| $A \setminus B$       | everything in $A$ that is not in $B$               | $\mathit{Combinations} \setminus \mathit{about}[\mathit{Entries}]$ |
| $\xrightarrow{\;f\;}$ | goes, by $f$, to                                   | $\mathit{Checks} \xrightarrow{\;\mathit{of}\;} \mathit{Entries}$   |
| $g \circ f$           | $f$, then $g$                                      | $\mathit{about} \circ \mathit{of}$                                 |
