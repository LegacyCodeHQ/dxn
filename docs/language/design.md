# dxn: a language for design and dimensions

This document designs a typed language for the ideas dimensions models today
in JSON: trees of nodes, their states, the dimensions they vary with, what
they look like, and the evidence that the design and the code match. It grows
one modeled element at a time, starting with the leaves.

Each section marks its status:

- **Decided**: agreed, and the rest of the design builds on it.
- **Proposed**: drafted here, waiting for a decision.
- **Open**: not designed yet.

## Goals

**Decided.**

- Keep the specification, the design and the code in step, with assertions
  the language checks.
- Be **typed**: mistakes the compiler reports today become type errors.
- Keep every enumerated part **finite**, so contexts can be counted exactly,
  rules checked exhaustively, and each look matched to one frame.
- Have a domain-free **core**, with **kits** that alias it for a domain: a UI
  kit, and later others such as project management.
- Compile to the model dimensions already has, so every check, query and
  piece of evidence keeps working.

## Approach

**Decided.** Start from the domain, not the syntax: take one modeled element,
list everything the model says about it, and derive the primitives that say
it. Begin with leaf nodes, which have no children, so everything about them is
local. The first is the wordmark; the blog link comes next, adding selection
and conditions joined with "or".

## Core and kits

**Decided:** the core is domain-free; kits alias its words for a domain.

**Proposed:** the core keywords are the model's own words. A root is not a
keyword: it is a node that nothing contains.

| Core keyword | Meaning                                      | UI kit alias     | Project-management alias |
| ------------ | -------------------------------------------- | ---------------- | ------------------------ |
| `type`       | a definition: its states, attributes, inputs | component        | task kind                |
| `node`       | a placement in a tree                        | element          | task                     |
| `fragment`   | a reusable subtree                           | pattern, section | template                 |
| (none)       | a node without a parent                      | page             | project                  |

## The wordmark, leaf by leaf

Today the model says this about the wordmark, across six files:

| Fact                                               | Where it lives today                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| hover (rest, hovered) and focus (blurred, focused) | `types.json`: state groups, type `wordmark`                                     |
| size 19, 20 or 22px by breakpoint                  | `types.json` (on rest and hovered) and `overrides/breakpoint.json`              |
| a ring when focused                                | `types.json`: `ring` per focus state                                            |
| accent when hovered                                | `types.json`: `color` per hover state                                           |
| no hover on touch, no focus without a keyboard     | `overrides/pointer.json`, `overrides/keyboard.json`: states removed             |
| varies with breakpoint, pointer, keyboard          | `dimensions/*.json`: `appliesTo: toolbar`, inherited from its place in the tree |

Size has nothing to do with hover, but today it hangs off the hover states,
because attributes can only be set per state. The language removes that.

**Proposed:**

```
enum Hover      = rest | hovered
enum Focus      = blurred | focused
dimension Breakpoint = base | sm | lg | xl
dimension Pointer    = mouse | touch
dimension Keyboard   = keyboard | no-keyboard

enum Size  = 19px | 20px | 22px
enum Ring  = none | focus
enum Color = primary | accent

type Wordmark {
  states hover: Hover, focus: Focus

  hover = hovered  only when Pointer = mouse
  focus = focused  only when Keyboard = keyboard

  look {
    size  = match Breakpoint { base => 19px, sm => 20px, lg | xl => 22px }
    ring  = match focus      { blurred => none, focused => focus }
    color = match hover      { rest => primary, hovered => accent }
  }
}
```

## Grammar

Built one concept at a time; each section here is implemented by the parser
in `src/language/parse.ts` and checked by `dimensions lang check <file>`.

### enum

**Decided and implemented.** An enum is a named, finite set of values. On its
own it compiles to nothing in today's model; its role comes from where it is
used: a type's states, the inputs a node provides, or the values in a look.

```ebnf
file  = { blank-line | enum | dimension | type } ;
enum  = "enum" name "=" value { "|" [ newline ] value } newline ;
name  = capital-letter { letter | digit } ;
value = ( letter | digit ) { letter | digit | "-" } ;
```

- One enum per line; after a `|`, the values may continue on the next line.
- Enum names start with a capital letter (`Hover`), so a set reads
  differently from its values (`hovered`).
- Values follow the same rule as names in today's JSON, so they carry over
  unchanged: `no-keyboard` and `19px` are values.

| Code              | Means                                                  |
| ----------------- | ------------------------------------------------------ |
| `syntax-error`    | what was expected, and what was found instead          |
| `enum-name`       | an enum name that does not start with a capital letter |
| `duplicate-enum`  | an enum declared twice                                 |
| `duplicate-value` | a value listed twice in one enum                       |

### dimension

**Decided and implemented.** A dimension is what the environment varies by,
such as the breakpoint. It lists its own values, in one place:

```ebnf
dimension = "dimension" name "=" value { "|" [ newline ] value } newline ;
```

```
dimension Breakpoint = base | sm | lg | xl
dimension Pointer    = mouse | touch
dimension Keyboard   = keyboard | no-keyboard
```

A dimension and an enum are both named sets of values; the difference is
what their values do. A dimension's value cascades down the tree, to
everything below where it is provided; an enum's values are only what a state
can be. So there is one way to declare each, and no choice between them:

- the environment varies by it: a `dimension`, such as `Breakpoint`;
- a state takes its values: an `enum`, such as `Hover`.

A dimension does not name an enum for its values, and a state cannot take its
values from a dimension. Its name is capitalized, as enum and type names are,
and shares the file's namespace with them.

Cascading and providing come later, with nodes; for now a dimension is only
declared.

| Code              | Means                                                      |
| ----------------- | ---------------------------------------------------------- |
| `dimension-name`  | a dimension name that does not start with a capital letter |
| `duplicate-name`  | a name already declared in the file                        |
| `duplicate-value` | a value listed twice in one dimension                      |
| `unknown-enum`    | a state whose values name a dimension                      |

### type

**Decided and implemented.** A type is a named definition; so far it holds
its states, each a field whose values come from an enum. `only when`,
`look` and initial values come later, each as its own concept.

```ebnf
type   = "type" name "{" { blank-line | states } "}" ;
states = "states" field { "," [ newline ] field } newline ;
field  = state-name ":" name ;
state-name = lowercase-letter { letter | digit | "-" } ;
```

```
type Wordmark {
  states hover: Hover, focus: Focus
}

type Toolbar {}
```

A state is not a variable: it holds no current value. It is a field of the
type's state, and the tool reasons about every value at once, so the look is
known for each. States belong to the element and change by interaction;
inputs such as the breakpoint come from outside.

Each scope keeps its names once:

| Scope    | Holds               | Rule                                       |
| -------- | ------------------- | ------------------------------------------ |
| the file | enum and type names | one namespace: no name twice, enum or type |
| a type   | its state fields    | no field twice                             |
| an enum  | its values          | no value twice                             |

| Code              | Means                                                    |
| ----------------- | -------------------------------------------------------- |
| `type-name`       | a type name that does not start with a capital letter    |
| `state-name`      | a state name that does not start with a lowercase letter |
| `duplicate-state` | a state listed twice in one type                         |
| `states-twice`    | a type with more than one `states` line                  |
| `unknown-enum`    | a state whose values name no enum, or name a type        |

### only when

**Decided and implemented.** A rule in a type says that one value of a state
exists only where a dimension has certain values. It brings the language's
first expressions: a dimension equal to a value, or in a list of values.

```ebnf
type      = "type" name "{" { blank-line | states | rule } "}" ;
rule      = state-name "=" value "only" "when" condition newline ;
condition = name ( "=" value | "in" "(" value { "," value } ")" ) ;
```

```
type Wordmark {
  states hover: Hover, focus: Focus

  hover = hovered  only when Pointer = mouse
  focus = focused  only when Keyboard = keyboard
}

type BlogLink {
  states hover: Hover
  hover = hovered  only when Breakpoint in (lg, xl)
}
```

A value without a rule exists everywhere; a value with one exists only where
its condition holds. The tool keeps the value in the situations where the
condition is true and leaves it out of the others, so the wordmark is never
hovered on a touch screen and never asks for a design of it. Today's model
says the same in `overrides/pointer.json` as "on touch, remove hovered"; the
rule says it positively, next to the state it limits.

| Code                | Means                                                      |
| ------------------- | ---------------------------------------------------------- |
| `unknown-state`     | a rule for a state the type does not have                  |
| `unknown-value`     | a value that is not one of the state's, or the dimension's |
| `unknown-dimension` | a condition on a name that is no dimension, or is an enum  |
| `duplicate-rule`    | a second condition for the same value of a state           |
| `duplicate-value`   | a value listed twice in one condition                      |

### environment and profile

**Decided and implemented.** A profile is one setup that occurs, such as a
phone: a value for each of some dimensions. Its type is an **environment**, a
product of dimensions, declared explicitly rather than inferred:

```ebnf
environment = "environment" name "=" name { "×" [ newline ] name } newline ;
profile     = "profile" profile-name ":" name "{" { assignment ( "," | newline ) } "}" ;
assignment  = name "=" value ;
```

```
environment Device = Breakpoint × Pointer × Keyboard

profile phone: Device {
  Breakpoint = base
  Pointer    = touch
  Keyboard   = no-keyboard
}
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
```

`*` may be written for `×`.

An environment is not a type. Both are product types, but a type describes an
element, whose instances the tool enumerates from its states, while an
environment describes a setup the page is viewed in, whose instances,
profiles, are written by hand. Keeping them apart keeps `type` about
elements: a type depends on dimensions through its rules, and an environment
gives them values.

Names follow one rule: a set of possibilities is capitalized (`Device`,
`Breakpoint`, `Hover`); one particular thing is lowercase (`phone`, `sm`,
`hover`). A profile is one particular combination, so its name is lowercase.

A profile gives each of its environment's dimensions exactly one value. Two
profiles may give the same combination. All profiles share one environment
for now. A profile derived from another, such as a tablet with a keyboard, is
inheritance; it comes later, with modifiers.

| Code                  | Means                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| `environment-name`    | an environment name that does not start with a capital letter                 |
| `profile-name`        | a profile name that does not start with a lowercase letter                    |
| `unknown-environment` | a profile whose environment is not declared, or is not one                    |
| `unknown-dimension`   | a part that is no dimension, or a value for a dimension the environment lacks |
| `duplicate-dimension` | a dimension twice in an environment or in a profile                           |
| `incomplete-profile`  | a profile that leaves out some of its environment's dimensions                |
| `mixed-profiles`      | profiles of different environments                                            |

## Evaluating

**Decided and implemented.** The language is evaluated directly, without
compiling it to today's JSON model first: a type can be evaluated on its own,
with no tree or page around it. `dimensions lang states <file> <type>` lists
the states a type has under each combination of the dimensions its rules use,
as JSON or, with `--table`, as a table:

| Pointer | Keyboard    | hover: rest | hover: hovered | focus: blurred | focus: focused |
| ------- | ----------- | ----------- | -------------- | -------------- | -------------- |
| mouse   | keyboard    | ✓           | ✓              | ✓              | ✓              |
| mouse   | no-keyboard | ✓           | ✓              | ✓              | —              |
| touch   | keyboard    | ✓           | —              | ✓              | ✓              |
| touch   | no-keyboard | ✓           | —              | ✓              | —              |

A value of a state is there in a row unless a rule limits it to dimension
values the row does not have. The dimensions are the ones the type's rules
use, so a type depends only on what it mentions. Without profiles, every
combination is a row, touch with a keyboard included. With profiles, there is
a row per profile, named in a `profile` column, so only the combinations that
occur remain; a dimension no profile gives still goes through each of its
values.

## Primitives

| Primitive          | Says                                                           | Replaces today                                      | Status   |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------- | -------- |
| `enum`             | a finite set of values                                         | state groups, dimension values, attribute values    | Decided  |
| `type`             | a definition with states, a look and inputs                    | types in `types.json`                               | Decided  |
| `states`           | a type's own fields                                            | state groups on a type                              | Decided  |
| `look`             | values computed from inputs and states                         | attributes and their overrides                      | Proposed |
| `match`            | an exhaustive choice by value                                  | per-state tables, overrides per value               | Proposed |
| `when`             | a default with exceptions                                      | overrides per value or combination                  | Proposed |
| `only when`        | a state value exists only where a condition holds; nodes later | overrides removing states; `only`, `onlyWhen` later | Decided  |
| `match` over nodes | exactly one of several nodes, by value                         | pairs of `only` that must not leave gaps            | Decided  |
| `provides`         | where an input's value comes from                              | dimensions, profiles, shared nodes                  | Proposed |

## Inputs: injection and cascade

**Proposed.** A type uses inputs, such as the breakpoint, and a node above it
provides them. The two are different statements:

- `provides` says where the value comes from: here, one per profile.
- A type's inputs say what it uses. They are **inferred** from its body: the
  wordmark matches on `Breakpoint` and limits its states by `Pointer` and
  `Keyboard`, so it needs all three. An optional `needs` line states them, and
  the checker holds it to the body.

Provided values **cascade**: every descendant receives them, until a node
provides a new value. Nodes in between do not mention them. The cascade is
resolved statically, so the tool can always answer where a node's input comes
from.

```
node ArticlePage provides Breakpoint, Pointer, Keyboard from profiles {
  Toolbar
}
```

The checker then holds:

- every input a type uses is provided above each place it is used: a menu
  button outside a menu, which provides `menu`, is a type error;
- a type uses only the inputs it needs, so an input it never reads, such as a
  future `theme`, does not multiply its contexts.

## Presence, replacement and override

Three different intents, each with its own guarantee.

### Presence

**Proposed.** A node or a state exists only where a condition holds. Its
descendants inherit the condition.

```
node Toolbar {
  Links only when Breakpoint in (lg, xl) { BlogLink }
}

type Wordmark {
  states hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
}
```

The checker holds the condition to real inputs and values.

### Replacement

**Decided: `match` writes replacement.** When one node takes another's place,
the choice is a `match` over the input, and the checker requires every value
to choose exactly one branch: no gaps, no overlaps.

```
node Toolbar {
  Wordmark
  match Breakpoint {
    base | sm => Menu provides menu: MenuState {
                   MenuButton
                   MenuPanel only when menu = open { MenuLink }
                 }
    lg | xl   => Links { BlogLink }
  }
}
```

Adding an `md` breakpoint without deciding what the toolbar shows there is a
type error, not a toolbar that silently loses its navigation. Two separate
`only when` conditions could leave such a gap or overlap; `match` states that
the nodes are alternatives.

### Override

**Proposed.** The same node keeps existing; a value changes in some contexts.

In the type, as a default with exceptions, or as a `match` that must cover
every value:

```
type Wordmark {
  look {
    size = 19px
    when Breakpoint = sm        { size = 20px }
    when Breakpoint in (lg, xl) { size = 22px }
  }
}
```

At a usage site, for one placement, which wins over the type:

```
node Footer {
  Wordmark { when Breakpoint = xl { size = 24px } }
}
```

A usage site can also narrow a child's states, as include states do today:

```
node ArticlePage {
  Toolbar { BlogLink.selection = selected }
}
```

**Precedence**, weakest first:

1. the type's values;
2. the type's `when` exceptions;
3. values at the usage site;
4. `when` exceptions at the usage site.

Two overrides at the same level that disagree are an error, as
`conflicting-override` is today, so the result never depends on order.

## What the type checker holds

| Mistake                                      | Today's diagnostic        | As a type error                                |
| -------------------------------------------- | ------------------------- | ---------------------------------------------- |
| a value not in its set                       | `unknown-dimension-value` | not a member of the enum                       |
| a state that cannot occur in a context       | `removed-state`           | outside the `only when` refinement             |
| a node used where it does not exist          | `absent-in-context`       | outside the node's presence                    |
| a case left out                              | (no counterpart)          | `match` not exhaustive                         |
| two alternatives that leave a gap or overlap | (no counterpart)          | `match` over nodes not exhaustive or ambiguous |
| an input nobody provides                     | indirect                  | input not provided above the usage site        |
| two overrides that disagree                  | `conflicting-override`    | the same                                       |

## Open

- **Values in a look**: literal enums such as `19px`, or typed units (a
  `Length`) and tokens (`$accent`) shared with the design file and the CSS.
  Tokens would let a runtime compare measured values with the model.
- **Conditions joined with "or"**: the blog link's underline shows when it is
  hovered or current. The next leaf.
- **Profiles and modifiers** as values of the provided inputs.
- **Transitions**: the menu's events, as a state machine on a provided state.
- **Expectations** as properties over all contexts.
- **Actors, evidence and records**: project-level facts typed by each actor's
  declaration, outside any type.
- **A runtime** that drives the running app and measures it, for verification
  against the code.
- **Kits**: how a kit declares its aliases and its built-in enums.
