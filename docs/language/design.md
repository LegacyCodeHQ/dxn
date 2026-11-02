# dxn: design notes

These notes keep the decisions behind dxn that the guide does not spell out,
and the questions still open. The language itself, as it is today, is in
[guide.md](guide.md).

## Goals

- Keep the specification, the design and the code in sync, with assertions
  the language checks.
- Be **typed**: every mistake is reported where it is made, with what to write
  instead.
- Keep every enumerated part **finite**, so combinations can be counted
  exactly and rules checked exhaustively.
- Have a domain-free **core**, with **kits** that give it the words of a
  domain: a UI kit, and later others.

## Approach

Start from the domain, not the syntax: take one modeled element, list
everything that must be said about it, and derive the primitives that say it.
One concept at a time, each settled before the next, each with a real case
from neo-website's toolbar behind it.

## Core and kits

The core is domain-free: types, states, dimensions, rules, children, records
and expectations describe any system whose states can be listed, not only a
user interface. A kit gives the core the words of a domain, without adding
anything the core could not say.

| Core        | Meaning                                | UI kit word | Another domain   |
| ----------- | -------------------------------------- | ----------- | ---------------- |
| `type`      | what an element is: its states         | component   | step, entity     |
| `has`       | an element inside another              | child       | part             |
| (none)      | a type that nothing contains           | screen      | process          |
| (none)      | a type declared at the top of a file   | component   | building block   |
| `dimension` | what the world around it varies by     | breakpoint  | region, plan     |
| `profile`   | a combination of the world that exists | device      | customer, market |

## Names

Every name a file declares at its top is capitalized, letters and digits
only: an enum, a dimension, a type, an environment, a profile, a modifier, a
record and an actor. A name for a single thing inside one, a state, a child,
a field, an action, an event or a value, starts lowercase. The case says
which kind of name it is, so a reader, the parser and the editors can tell
`Phone` the profile from `phone` a value without looking it up. Declaring a
type inside another makes it part of that type; declaring it at the top makes
it shareable.

## Nesting

Braces decide what is inside a type, wherever a line starts, when every
brace in the file is closed; a declaration word at the start of a line ends
one left open only when a brace is missing. So a declaration moved into a
type belongs to it before it is indented, and formatting indents it; and a
forgotten `}` still does not swallow the rest of the file.

## Evidence

Evidence is what an actor records: one stored record for each look of an
element, each saying who recorded it and which drawing shows it.

- **Actors.** `actor DesignAgent records PenEvidence` names who records what,
  one record each. A record an actor records is stored, and each stored
  record has a context, the look it is about, and the actor who recorded it.
- **PenNode.** A built-in record: a pen.dev file, a frame and, optionally, a
  node in it, with a fingerprint `dxn attach` computes, of the node or else
  the frame, with the components and variables it uses and without its
  position. A drawing whose fingerprint has changed is stale; one no longer
  there is gone. The node's name is part of the fingerprint, so renaming a
  node makes its evidence stale.
- **What a drawing proves.** Evidence is an actor's assertion, not a check:
  dxn checks that a record names a real look and that its drawing has not
  changed since, not that the drawing shows that look.

### Looks

What needs evidence is an element's **looks**: its own states and the
dimensions it needs, one value each. A child's looks in place are its own
too. Its parents decide which of them occur, never add any: a tab with two
selections and three interactions has six looks, in a bar or on its own, and
fewer only where the bar narrows them. A record matches a look by its own
states and dimensions, and its profile, whatever placed it.

### Components

A type declared at the top of a file is a **component**: counted on its own,
as a tree of its own, though another type contains it, so a design system
draws each component once, in all its looks. A record about an element
covers that element everywhere else it is, in the same look: a component's
drawings cover it in every screen that places it, and a drawing in one place
covers the component. A record about the place itself comes first. A type
declared inside another is a part of it, counted only in place; a type that
receives a state from its parent cannot stand on its own, and is counted
only in place too.

### Bindings

A binding sets a child's state from a state of its parent, or a dimension,
mapped by a `when` when the two have different values. It can also **fix**
the child's state to one of its values, `has tabs: TabBar { section = feed }`,
which is how a screen pins the parts it shows. A lowercase name after `=` is
the parent's state when the parent has one of that name, and otherwise a
value of the child's state; a name that is both is an error, never read one
way silently.

### When and else

A `when` gives a value for every value of its subject, and a value left out
is reported. `else`, its last branch, gives one value to all the others, on
purpose; it also covers a value added later without a report, so it is for
"anything else", not for saving a line. An `else` with nothing to cover is a
warning.

### Outdated evidence

A record made before its element gained a state or a dimension does not say
which value of it the drawing shows. It is **outdated**: a warning, not an
error, counted apart, and named by what was added, `9 outdated: hover added`.
dxn does not guess the missing value; whoever recorded the drawing gives it.
A record that names a value, a state or a path the model no longer has is
an error, set apart where its element is written, while every other record
still counts.

### What a line counts

A line answers for what it declares. A type's line counts the type's own
tree. A `has` line counts its child within the own tree of the type that
declares it: the tabs of a bar count in the bar, not again in every screen
that places the bar, which declares its use of the bar on a line of its own.
A type only ever placed, declared inside another or receiving a state, has
no tree of its own, so its `has` lines count every place it is in.

### What an editor shows

After each type, and each part placed in a type, a hint gives each record's
count, marked `●` every look
present, `◐` some, `○` none, or `◌` something needing a decision: a drawing
stale or gone, a record outdated, or a record with problems. `◌` wins over
the count. A usage of a component, a `has` line whose child is a
component, has no hint: the component's own line counts its looks, and the
usage's count is over the child's name, in its hover. Over an element's
name, the hover lists what is missing, stale, gone, outdated or wrong. A review page per tree, written by `dxn review` to
a cache outside the repository, shows each look with the picture recorded,
and `--stale` only what needs a decision.

## Open

- **Drawings are not checked against the model.** A drawing recorded for a
  look is trusted to show it: a screen that leaves out a child the model
  has, or shows one it does not, is not found. This is the largest gap.
- **Any drawing covers a component.** A drawing of an element in one place
  counts for its component on its own, and for every other place. A place
  where the element looks different would need a drawing of its own; nothing
  tells a reader that one is needed.
- **Migrations by hand.** Adding a state outdates every record of its
  element; giving them the value they show is a hand edit of the stored
  records. A `dxn migrate` would do it from a mapping.
- **States that exist only sometimes.** A disabled button has no pressed or
  released; dxn has no state that is absent in some combinations, so the
  model merges such states into one, as `interaction` does.
- **Not equal.** A condition cannot say `press != pressed`; with two values
  it says `press = released`, and with more it lists the rest.
- **`else` as a value.** A value named `else` reads as the keyword inside a
  `when`; nothing reserves the word.
- **Review pictures.** Pictures are exported by whoever attaches the
  evidence, to a local cache: they are not shared, and nothing checks that
  each record has one.

- **Events in a kit.** Events are names a type declares, and focus moves by
  an action of the child that takes it, so the core gives no word a meaning
  of its own. A UI kit could declare the usual events, such as `activate` and
  `escape`, for every type to use.
- **Provided state, checked by `dxn check`.** A receiving type placed where
  nothing provides its state is found only when its path is evaluated.
- **Evidence that contradicts what `alike` says.**
- **A runtime** that drives the running system into each combination and
  records what it shows.
- **Kits**: how a kit declares its words, its events and its built-in enums.
