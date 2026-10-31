# dxn: a guide

This guide teaches dxn, the language of design and dimensions, one concept at
a time. Each section adds one idea, says why you need it, and ends with a file
you can check yourself. It covers the language as it is today; the last
section lists what is still being designed. For the reasoning behind each
decision, see [design.md](design.md).

## Why a language

Take one small element of a website: the wordmark in its toolbar. It sounds
simple, but ask which cases it has to handle and the answers multiply:

- With a mouse it can be hovered; with a finger it cannot.
- With a keyboard it can be focused; without one it cannot.
- It has to work at every screen size, from a phone to a desktop.

Every one of those is a question of _which combination_. Multiply the inputs,
the screen sizes and the states together and a single wordmark has dozens of
combinations, most of which nobody ever writes down. The designer draws some
of them, the developer builds some of them, and the two sets drift apart
without anyone noticing.

dxn is where you write those combinations down once, in a form a tool can
check. You state what an element's states are, what the world around it
varies by, and which states exist under which conditions. The tool then
answers the questions that are otherwise guesswork: _which states does this
element have on a phone? which combinations exist at all? what did I forget?_

The same file says what is recorded about those combinations: who drew or
built one, when, and where. That data is stored next to the file, checked
against the declarations, and kept in step with them when a name changes, so
the specification, the design and the code can be compared case by case.

The language is written for people and for AI agents alike. Everything is
declared explicitly, so a reader, human or not, can see what an element
depends on without running anything, and every mistake is reported at the
place it was made, with what to write instead.

## What kind of language this is

dxn is not a general-purpose programming language: nothing in it runs. It is
a declarative specification language, with its own syntax, over finite sets of
values. Each part of it comes from a family of languages you may know:

| What it has                                        | Where the idea comes from                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| dimensions, environments, profiles and `only when` | variability modeling, as in the feature models of software product lines: profiles are the configurations that exist         |
| every combination listed and checked               | finite-state specification, as in Alloy or TLA+: because every set is finite, the whole space is checked, not sampled        |
| records, scalars and stored data                   | schema languages such as Protobuf, JSON Schema or CUE: types that data is stored as and checked against                      |
| `lang rename`, which rewrites the stored data      | schema evolution: every stored value is typed, so a rename knows exactly which values to change                              |
| evidence that actors record as they draw and build | model-based testing: the model says which cases must exist, and the evidence records which ones the design and the code show |

Put together, dxn is a typed specification of what varies: every case can be
counted, and recorded evidence says which cases the real system shows.

## Your first file

A dxn file is plain text, and its name ends in `.dxn`. The `lang check`
command reads one, reports any problems, and otherwise prints what it
declares as JSON:

```bash
dxn lang check wordmark.dxn
```

It needs no project, so you can try everything in this guide in an empty
folder. Four commands work on a file, each introduced where it is needed:

| Command                                   | What it does                                                |
| ----------------------------------------- | ----------------------------------------------------------- |
| `lang check <file>`                       | reports every problem, or prints what the file declares     |
| `lang states <file> <Type> [--table]`     | evaluates a type: its states in each profile or combination |
| `lang validate <file>`                    | checks every stored record against its declaration          |
| `lang rename <file> <Enum>.<value> <new>` | renames an enum's value in the file and its stored records  |

A `#` starts a comment, which runs to the end of the line. Use comments for
the _why_ that the declarations cannot say:

```
# The wordmark in the toolbar: the site's name, linking home.
```

## Enums: a named set of values

The first thing to say about the wordmark is what states it can be in. Its
hover is either at rest or hovered; its focus is either blurred or focused.
Each of these is a closed set of values, and a closed set is an **enum**:

```
enum Hover = rest | hovered
enum Focus = blurred | focused
```

An enum lists every value it has, split by `|`. A long one can carry on to the
next line after a `|`:

```
enum Size = xs | sm | md |
  lg | xl
```

Why closed sets? Because a finite set can be counted. If `Hover` has two
values and `Focus` has two, there are exactly four combinations, and the tool
can list every one and tell you which you have not covered. An open set, like
"any string", could never be checked that way.

Two rules keep enums unambiguous:

- **An enum's name starts with a capital letter.** In this language, a name
  for a _set of possibilities_ is capitalized, and a name for a _single thing_
  (a value, a state, a profile) starts with a lowercase letter. You can tell
  which one you are reading at a glance.
- **Each value appears once,** and each name is declared once in the file.

## Types and states

An enum on its own is just a set of values. To say that the wordmark _has_ a
hover and a focus, declare a **type**:

```
enum Hover = rest | hovered
enum Focus = blurred | focused

type Wordmark {
  states hover: Hover, focus: Focus
}
```

A type is the kind of element you are describing. Its `states` line lists its
state fields: each has a lowercase name, a colon, and the enum its values come
from. The line can carry on after a comma.

A type's states are independent of each other, so the wordmark above can be
in any of the four combinations of hover and focus. You can ask the tool for
them:

```bash
dxn lang states wordmark.dxn Wordmark --table
```

```
| hover: rest | hover: hovered | focus: blurred | focus: focused |
| ----------- | -------------- | -------------- | -------------- |
| ✓           | ✓              | ✓              | ✓              |
```

Every value is available, because nothing yet says otherwise. That is about
to change.

The checker holds you to what you declared. Misspell a state's enum, or name
a state with a capital letter, and it says so, with the line and column:

```
wordmark.dxn:3:24: state-name: state names start with a lowercase letter: "Focus"
wordmark.dxn:3:31: unknown-enum: Focus is not an enum (Hover)
```

## Dimensions: what the world varies by

A hovered state only makes sense with a mouse, and a focused one only with a
keyboard. Whether the reader has a mouse or a keyboard is not something the
wordmark decides: it is a fact about the world the wordmark is shown in. A
fact that varies like this is a **dimension**:

```
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
```

A dimension is written like an enum: a capitalized name and its values. The
difference is what it means. An enum's values belong to an element: the
wordmark _is_ hovered. A dimension's values belong to the surroundings: the
reader _has_ a mouse. Later, a dimension's value will flow down the page from
whatever provides it to every element inside, which an enum's never does.

A dimension always lists its own values. There is no way to make a dimension
out of an enum, so there is never a question of which of the two to use: if
it describes the element, it is an enum; if it describes the world around it,
it is a dimension.

## Needs: what a type depends on

Now the wordmark depends on the reader's pointer and keyboard. Say so on the
type, with **needs**:

```
type Wordmark needs Pointer, Keyboard {
  states hover: Hover, focus: Focus
}
```

`needs` lists the dimensions a type depends on. It is a promise in both
directions: the type will only ask about these dimensions, and whatever
places the type will have to provide them.

Why write this down, when the tool could work it out from the rules below?
Because then it would be checked against nothing. With `needs`, what a type
depends on is visible on its first line, to a person skimming the file and to
an agent reading it, and the rules inside are checked against it. When a rule
uses a dimension the type does not need, the error is at that rule, and says
exactly what to declare:

```
wordmark.dxn:5:29: unneeded-dimension: Wordmark does not need Pointer; declare "type Wordmark needs Pointer"
```

A need that nothing uses yet is allowed, but you will get a warning, so a
stale need does not linger unnoticed:

```
wordmark.dxn:4:21: warning: unused-need: Wordmark needs Breakpoint, but no rule uses it
```

A warning does not fail the check: the file is still usable.

## Only when: where a state's value exists

With the dimensions declared and needed, you can say what was true all along:
the wordmark can only be hovered with a mouse, and only focused with a
keyboard. A rule says that a state's value exists **only when** a dimension
has a value:

```
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard

enum Hover = rest | hovered
enum Focus = blurred | focused

type Wordmark needs Pointer, Keyboard {
  states hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}
```

A rule names a state, one of its values, and a condition on a needed
dimension. Values without a rule, like `rest` and `blurred`, exist
everywhere. A rule only ever takes a value away where its condition is false;
it never adds one.

When a value exists under several of a dimension's values, list them with
`in`:

```
dimension Breakpoint = base | sm | lg | xl
enum Hover = rest | hovered

type BlogLink needs Breakpoint {
  states hover: Hover
  hover = hovered only when Breakpoint in (lg, xl)
}
```

Each state value has at most one rule, so there is a single place to read
where it exists. A second rule for the same value is an error.

## Evaluating: the matrix

This is where the language pays off. Ask for the wordmark's states again:

```bash
dxn lang states wordmark.dxn Wordmark --table
```

```
| Pointer | Keyboard    | hover: rest | hover: hovered | focus: blurred | focus: focused |
| ------- | ----------- | ----------- | -------------- | -------------- | -------------- |
| mouse   | keyboard    | ✓           | ✓              | ✓              | ✓              |
| mouse   | no-keyboard | ✓           | ✓              | ✓              | —              |
| touch   | keyboard    | ✓           | —              | ✓              | ✓              |
| touch   | no-keyboard | ✓           | —              | ✓              | —              |
```

There is one row for each combination of the dimensions the type needs, in
the order it needs them, and a ✓ for each state value that exists there. This
table is the matrix the introduction talked about: every case the wordmark
has to handle, worked out from four lines of rules. A designer can draw from
it, a developer can build from it, and nobody has to guess which cases exist.

Without `--table`, the command prints the same matrix as JSON, for tools and
agents.

## Environments: the shape of a device

Four rows is manageable, but add a screen size with four breakpoints and the
wordmark has sixteen. Many of those combinations never happen: nobody uses a
touch-only laptop with a keyboard and an extra-large screen. The world is not
every combination; it is a handful of real devices.

The first step is to say which dimensions make up a device. That is an
**environment**: a product of dimensions, written with `x`, read "by":

```
environment Device = Breakpoint x Pointer x Keyboard
```

Read it the way you would read the size of a grid: a Device is a Breakpoint
by a Pointer by a Keyboard. Put spaces around the `x`; a long product can
carry on to the next line after one. The `x` is only special here, between
dimension names (which are always capitalized), so `x` is still an ordinary
value everywhere else.

## Profiles: the devices that exist

An environment is the shape; a **profile** is one real instance of it, giving
each of its dimensions a value:

```
dimension Breakpoint = base | sm | lg | xl
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard

enum Hover = rest | hovered
enum Focus = blurred | focused

type Wordmark needs Pointer, Keyboard {
  states hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}

environment Device = Breakpoint x Pointer x Keyboard

profile phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile tablet: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
```

A profile's name is lowercase, because it is a single thing. After the colon
comes the environment it is an instance of, then a value for each of that
environment's dimensions, split by commas or lines.

Now the matrix has one row per profile instead of one per combination:

```
| profile | Pointer | Keyboard    | hover: rest | hover: hovered | focus: blurred | focus: focused |
| ------- | ------- | ----------- | ----------- | -------------- | -------------- | -------------- |
| phone   | touch   | no-keyboard | ✓           | —              | ✓              | —              |
| tablet  | touch   | no-keyboard | ✓           | —              | ✓              | —              |
| laptop  | mouse   | keyboard    | ✓           | ✓              | ✓              | ✓              |
```

These are the cases that matter, named the way the team talks about them.

A profile must be complete and correct: every dimension of its environment,
once, with one of its values. All profiles in a file share one environment, so
they can be compared row by row.

```
wordmark.dxn:4:9: incomplete-profile: laptop does not give Keyboard, which Device requires
wordmark.dxn:5:34: unknown-value: "pen" is not a value of Pointer (mouse, touch)
```

A type can need a dimension that the profiles do not give. The theme, for
instance, is not part of the device: any device can be light or dark. Such a
dimension still goes through each of its values, within each profile:

```
dimension Pointer = mouse | touch
dimension Theme = light | dark

enum Hover = rest | hovered
enum Tone = plain | inverted

type Wordmark needs Pointer, Theme {
  states hover: Hover, tone: Tone
  hover = hovered only when Pointer = mouse
  tone = inverted only when Theme = dark
}

environment Device = Pointer
profile phone: Device { Pointer = touch }
profile laptop: Device { Pointer = mouse }
```

```
| profile | Pointer | Theme | hover: rest | hover: hovered | tone: plain | tone: inverted |
| ------- | ------- | ----- | ----------- | -------------- | ----------- | -------------- |
| phone   | touch   | light | ✓           | —              | ✓           | —              |
| phone   | touch   | dark  | ✓           | —              | ✓           | ✓              |
| laptop  | mouse   | light | ✓           | ✓              | ✓           | —              |
| laptop  | mouse   | dark  | ✓           | ✓              | ✓           | ✓              |
```

## Records: plain data

Everything so far describes the matrix: what an element's states are, and
where each one exists. But the tools around the matrix also keep data about
it. When a designer draws a combination, the evidence they record says who
recorded it, when, and where the drawing is. That data has a shape, and a shape is worth
checking just as much as the states are.

A **record** is that shape: a named group of typed fields.

```
enum Actor = design-agent

record Source {
  # where the drawing is
  file: RelativePath
  frame: NonEmptyString
}

record Evidence {
  actor: Actor
  source: Source
}
```

A record's name is capitalized, like every other set of possibilities. Its
fields come one to a line, each a lowercase name, a colon, and its type: an
enum (`Actor`), another record (`Source`), or a scalar (`RelativePath` and
`NonEmptyString`, below). A short record can sit on one line:
`record Note { text: NonEmptyString }`.

A record is not a type. A type is an element: it needs dimensions and has
states that come and go with them. A record is plain data, with nothing that
varies: every field is given, every time. That is also why a record cannot
contain itself, directly or through other records: it could never be written
down.

```
recursive-record: Evidence contains itself: Evidence.source is a Source, and Source.back is an Evidence
```

### Scalars: values that are checked, not listed

Some data can never be an enum: the moment evidence was recorded, for
instance, is one of endlessly many. A **scalar** is a built-in type whose
values are checked rather than listed:

| Scalar           | A valid value                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Timestamp`      | an ISO 8601 date and time with a time zone, e.g. `2026-10-31T08:50:05Z`                                                           |
| `NonEmptyString` | at least one character, with no spaces at either end and no control characters                                                    |
| `RelativePath`   | a path from the repository root: parts split by `/`, none of them empty, `.` or `..`, and none with a `\` or spaces at either end |

With them, `Evidence` can hold everything an actor records: who, when, where
the drawing is, and the drawing's fingerprint at that moment.

```
enum Actor = design-agent

record Source {
  file: RelativePath
  frame: NonEmptyString
}

record Evidence with context {
  actor: Actor
  at: Timestamp
  source: Source
  fingerprint: NonEmptyString
}
```

(`with context` is the next section.) Scalars only type a record's fields. A state or a dimension cannot have one:
their values must be listed, so a type's combinations can always be counted.
A scalar's name is built in, so a file cannot declare it.

### With context: a fact about one combination

Evidence is always about one case of the matrix: _this_ drawing shows the
wordmark on a laptop, in the dark theme, hovered. A record that is a fact about
one combination says so on its first line:

```
record Evidence with context {
  actor: Actor
  at: Timestamp
  source: Source
  fingerprint: NonEmptyString
}
```

Every stored `Evidence` then has a `context`: the one row of `lang states` it
is about. The field is not listed among the record's fields, because every
record with context has it, in the same shape:

| Part         | What it holds                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `type`       | the type it is about                                                                                      |
| `profile`    | the profile, when the file declares profiles; it fixes the dimensions it gives                            |
| `dimensions` | a value for each dimension the type needs that the profile does not give, or all of them without profiles |
| `states`     | a value for every state of the type                                                                       |

```json
"context": {
  "type": "Wordmark",
  "profile": "laptop",
  "dimensions": { "Theme": "dark" },
  "states": { "hover": "hovered", "tone": "inverted" }
}
```

A context is always complete: one exact cell, nothing left out and nothing
extra. Dimensions and states each have their own group, so a state can be
named anything, even `profile`. And it is checked against the matrix, not
only against the enums: `hovered` is a value of `hover`, but there is no
hovered wordmark on a phone, so a context that says so is reported.

Only a record with context can be stored, since stored data is a fact about
the matrix. A record with context cannot be a field of another record, which
would give it a second context, and it cannot declare a field named
`context`. A record without it, like `Source`, is a part of the facts that
contain it.

### Where records are stored, and checking them

A record's data is stored by convention, so no declaration has to say where:
**a record is stored in a folder named after it, next to the file that
declares it.** The folder's name is the record's name in kebab-case, with no
plural: `Evidence` is stored in `evidence/`, `DesignReview` in
`design-review/`. Every `.json` file in the folder holds a list of the record,
so the data can be split across as many files as you like:

```
evidence.dxn                # declares record Evidence with context
evidence/
  wordmark.json             # [ {…}, {…} ]
  menu-button.json
```

A record with no folder is not stored: `Source` above only ever appears
inside `Evidence`, so it needs none. Only a record with context can have a
folder; for any other, `lang validate` stops before checking anything:

```
dxn: Source is stored in source/, but has no context; declare "record Source with context"
```

Each stored record is an object with its `context`, and a key for every
field: a record field holds an object, an enum field one of the enum's values
as a string, and a scalar field a string that is a valid value of the scalar.

```json
[
  {
    "context": {
      "type": "Wordmark",
      "profile": "laptop",
      "dimensions": { "Theme": "dark" },
      "states": { "hover": "hovered", "tone": "inverted" }
    },
    "actor": "design-agent",
    "at": "2026-10-31T08:50:05Z",
    "source": { "file": "design/website.pen", "frame": "R353q" },
    "fingerprint": "8056e176dcb1b7aa7e3c6ce6aee142848862fa5a"
  }
]
```

`lang validate` checks every stored record against its declaration:

```bash
dxn lang validate evidence.dxn
```

```
evidence/wordmark.json:19:28: unknown-value: $[1].context.states.hover: "hovered" is not a value of hover on phone, Theme dark (rest)
evidence/wordmark.json:21:14: unknown-value: $[1].actor: "designer" is not a value of Actor (design-agent)
```

Every field must be given, each of its type, and no others. Each problem has
its file, line and column, and its JSON path, so a person or an agent can go
straight to it. When everything is valid, the command prints what it checked:

```json
{
  "file": "evidence.dxn",
  "stored": [{ "record": "Evidence", "folder": "evidence", "files": 1, "records": 2 }]
}
```

### Renaming a value

An enum's values are stored as text, so renaming one by hand leaves every
stored record that used it invalid. `lang rename` renames it everywhere at
once: in the enum, in the rules on states of that enum, and in every stored
record's fields of that enum, nested ones included, and in the states of
every context.

```bash
dxn lang rename evidence.dxn Actor.design-agent designer
```

```json
{
  "file": "evidence.dxn",
  "enum": "Actor",
  "from": "design-agent",
  "to": "designer",
  "written": ["evidence.dxn", "evidence/wordmark.json"],
  "records": 2
}
```

It only touches the value where it means that enum's value: the same text in
another enum, a dimension, or a string field stays as it is, and so does the
rest of each file, comments and spacing included. It refuses a new name that
is already a value or is not written like one, and it changes nothing while
the file or its stored records have problems, so a rename never mixes with
them. Add `--dry-run` to see every file it would write, without writing.

With these, evidence is checked by the language itself: its shape, its
values, and that the combination it is about exists.

## When something is wrong

Every problem is reported as `file:line:column: code: message`, in the order
it appears in the file, and every one is reported at once, so you can fix them
all in one pass. A problem in stored data also has its JSON path:
`file:line:column: code: path: message`. The code is stable, for tools; the message is for reading,
and usually says what was expected or what to write instead.

There are two kinds:

- An **error** means the file cannot be used: every command exits with code
  1, and nothing is evaluated, validated or renamed.
- A **warning** has `warning:` before its code. The file is still usable, and
  the command still succeeds.

A mistake in one declaration does not cause a cascade of others. The tool
reports the mistake, keeps whatever it read of that declaration, and carries
on from the next line that starts a declaration. Uses of a declaration that
did not parse are not reported again:

```
enum Hover = rest hovered
type Wordmark {
  states hover: Hover
}
```

```
wordmark.dxn:1:19: syntax-error: expected "|" or the end of the line after "rest", found "hovered"
```

Only the real mistake is reported: the missing `|`. `Hover` is still known to
be an enum, so the state that uses it is fine.

## What is still being designed

The language grows one concept at a time, and the concepts below are designed
or under discussion but not part of it yet; see [design.md](design.md):

- **Answers from evidence.** Evidence now says which combination it is for.
  Next: what is missing (every combination `lang states` lists that has no
  evidence), and which combinations look the same (those whose evidence
  points to the same frame). Evidence is for a type today; for each element
  of a type in a page, it waits for nodes.
- **More renames.** `lang rename` renames an enum's value. Renaming a field,
  a record (and its folder), or an enum, dimension or type is still to come.
- **Provides and cascade.** Today, profiles are the only things that give
  dimensions their values. Next, an element in a page will _provide_ a
  dimension, and every element inside it that _needs_ it will receive the
  value. That is dependency injection: `needs` is already its first half.
- **A runtime.** Evidence today is recorded by the actors that draw and
  build. A runtime would check the real system itself, driving a browser or a
  device into each combination and recording what it shows.
- **Modifiers.** Accessories that change some profiles' values, like an iPad
  with a Magic Keyboard.
- **Kits.** Domain words that alias the core, such as a UI kit, so the same
  language can describe other domains. `Actor` in the records above is already
  the pattern: the core knows nothing about any actor or tool; a file or a kit
  declares them.

### What the language leaves out

The language says what exists: the states, what they depend on, and which
combinations happen. It does not say what anything looks like: no colors,
sizes or icons. Whether two combinations look the same is something you
observe, not something you declare. Evidence answers it: two combinations
whose evidence points to the same design frame, or later to the same
rendering in the code, look the same.

## Reference

### Names

| Kind        | Example                       | Written                                             |
| ----------- | ----------------------------- | --------------------------------------------------- |
| enum        | `Hover`                       | capital letter                                      |
| dimension   | `Pointer`                     | capital letter                                      |
| type        | `Wordmark`                    | capital letter                                      |
| environment | `Device`                      | capital letter                                      |
| record      | `Evidence`                    | capital letter                                      |
| state       | `hover`                       | lowercase letter                                    |
| profile     | `laptop`                      | lowercase letter                                    |
| field       | `source`                      | lowercase letter                                    |
| value       | `rest`, `no-keyboard`, `19px` | a letter or digit, then letters, digits and hyphens |

Every enum, dimension, type, environment, profile and record shares one namespace:
each name is declared once in a file.

### Grammar

```
file        = { blank-line | comment | enum | dimension | type | environment | profile | record }
enum        = "enum" Name "=" value { "|" [newline] value } newline
dimension   = "dimension" Name "=" value { "|" [newline] value } newline
type        = "type" Name [ "needs" Name { "," [newline] Name } ] "{" { blank-line | states | rule } "}"
states      = "states" field { "," [newline] field } newline
field       = state-name ":" Name
rule        = state-name "=" value "only" "when" condition newline
condition   = Name ( "=" value | "in" "(" value { "," value } ")" )
environment = "environment" Name "=" Name { "x" [newline] Name } newline
profile     = "profile" profile-name ":" Name "{" { assignment ( "," | newline ) } "}"
assignment  = Name "=" value
record      = "record" Name [ "with" "context" ] "{" { blank-line | field-name ":" Name newline } "}"
comment     = "#" to the end of the line
```

### Diagnostics

| Code                                                                          | Severity | When                                                                                             |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `syntax-error`                                                                | error    | the text does not follow the grammar                                                             |
| `enum-name`, `dimension-name`, `type-name`, `environment-name`, `record-name` | error    | the name does not start with a capital letter                                                    |
| `state-name`, `profile-name`, `field-name`                                    | error    | the name does not start with a lowercase letter                                                  |
| `duplicate-name`                                                              | error    | a name is declared twice in the file                                                             |
| `duplicate-value`                                                             | error    | a value appears twice in an enum, dimension or condition                                         |
| `duplicate-state`                                                             | error    | a type has two states with one name                                                              |
| `states-twice`                                                                | error    | a type has two `states` lines                                                                    |
| `duplicate-rule`                                                              | error    | a state value has two rules                                                                      |
| `duplicate-dimension`                                                         | error    | a dimension appears twice in a type's needs, an environment or a profile                         |
| `unknown-enum`                                                                | error    | a state's values come from something that is not an enum                                         |
| `unknown-dimension`                                                           | error    | a name used as a dimension is not one                                                            |
| `unknown-state`                                                               | error    | a rule names a state the type does not have                                                      |
| `unknown-value`                                                               | error    | a value is not one of its enum's or dimension's                                                  |
| `unneeded-dimension`                                                          | error    | a rule uses a dimension its type does not need                                                   |
| `unknown-environment`                                                         | error    | a profile's environment is not one                                                               |
| `incomplete-profile`                                                          | error    | a profile leaves out a dimension of its environment                                              |
| `mixed-profiles`                                                              | error    | profiles are instances of different environments                                                 |
| `duplicate-field`                                                             | error    | a record has two fields with one name                                                            |
| `unknown-type`                                                                | error    | a field's type is not an enum, a record or a scalar                                              |
| `recursive-record`                                                            | error    | a record contains itself                                                                         |
| `nested-context`                                                              | error    | a record's field is a record with context, which would be a second context                       |
| `reserved-name`                                                               | error    | a declaration has a built-in scalar's name, or a record with context has a field named `context` |
| `unused-need`                                                                 | warning  | a type needs a dimension that no rule uses                                                       |

Checking stored records with `lang validate` reports these, after any problem with the
JSON itself:

| Code            | When                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrong-kind`    | a value is not the kind its place needs: a list, an object or a string                                                                                                 |
| `missing-field` | a record leaves out one of its fields, its context, or a part of its context                                                                                           |
| `unknown-field` | a record or a context has a field its declaration does not                                                                                                             |
| `unknown-value` | an enum field's value is not one of the enum's; or a context's type, profile, dimension or state value is not one of the file's, or does not exist in that combination |
| `invalid-value` | a scalar field's value is not a valid value of the scalar                                                                                                              |
