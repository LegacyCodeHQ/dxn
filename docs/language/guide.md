# The dimensions language: a guide

This guide teaches the dimensions language one concept at a time. Each
section adds one idea, says why you need it, and ends with a file you can
check yourself. It covers the language as it is today; the last section lists
what is still being designed. For the reasoning behind each decision, see
[design.md](design.md).

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

The dimensions language is where you write those combinations down once, in a
form a tool can check. You state what an element's states are, what the world
around it varies by, and which states exist under which conditions. The tool
then answers the questions that are otherwise guesswork: _which states does
this element have on a phone? which combinations exist at all? what did I
forget?_

The language is written for people and for AI agents alike. Everything is
declared explicitly, so a reader, human or not, can see what an element
depends on without running anything, and every mistake is reported at the
place it was made, with what to write instead.

## Your first file

A file is plain text. By convention it ends in `.dim`. The `lang check`
command reads one, reports any problems, and otherwise prints what it
declares as JSON:

```bash
dimensions lang check wordmark.dim
```

It needs no project, so you can try everything in this guide in an empty
folder.

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
dimensions lang states wordmark.dim Wordmark --table
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
wordmark.dim:3:24: state-name: state names start with a lowercase letter: "Focus"
wordmark.dim:3:31: unknown-enum: Focus is not an enum (Hover)
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
wordmark.dim:5:29: unneeded-dimension: Wordmark does not need Pointer; declare "type Wordmark needs Pointer"
```

A need that nothing uses yet is allowed, but you will get a warning, so a
stale need does not linger unnoticed:

```
wordmark.dim:4:21: warning: unused-need: Wordmark needs Breakpoint, but no rule uses it
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
dimensions lang states wordmark.dim Wordmark --table
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
wordmark.dim:4:9: incomplete-profile: laptop does not give Keyboard, which Device requires
wordmark.dim:5:34: unknown-value: "pen" is not a value of Pointer (mouse, touch)
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
it. When a designer draws a combination, the evidence they record says which
tool it was drawn in and where. That data has a shape, and a shape is worth
checking just as much as the states are.

A **record** is that shape: a named group of typed fields.

```
enum Tool = pen-dev | code
enum Verdict = passed | failed

record Source {
  # where the evidence is
  tool: Tool
  verdict: Verdict
}

record Evidence { source: Source }
```

A record's name is capitalized, like every other set of possibilities. Its
fields come one to a line, each a lowercase name, a colon, and its type: an
enum, another record, or a scalar (below).

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

```
record Source {
  file: RelativePath
  frame: NonEmptyString
}

record Evidence {
  at: Timestamp
  source: Source
  fingerprint: NonEmptyString
}
```

Scalars only type a record's fields. A state or a dimension cannot have one:
their values must be listed, so a type's combinations can always be counted.
A scalar's name is built in, so a file cannot declare it.

### Where records are stored, and checking them

A record's data is stored by convention, so no declaration has to say where:
**a record is stored in a folder named after it, next to the file that
declares it.** The folder's name is the record's name in kebab-case, with no
plural: `Evidence` is stored in `evidence/`, `DesignReview` in
`design-review/`. Every `.json` file in the folder holds a list of the record,
so the data can be split across as many files as you like:

```
evidence.dim                # declares record Evidence
evidence/
  article-page.json         # [ {…}, {…} ]
  home-page.json
```

A record with no folder is not stored: `Source` above only ever appears
inside `Evidence`, so it needs none.

Each stored record is an object with a key for every field: a record field
holds an object, an enum field one of the enum's values as a string, and a
scalar field a string that is a valid value of the scalar.

```json
[
  {
    "actor": "design-agent",
    "at": "2026-10-31T08:50:05Z",
    "source": { "file": "design/website.pen", "frame": "R353q" },
    "fingerprint": "8056e176dcb1b7aa7e3c6ce6aee142848862fa5a"
  }
]
```

`lang validate` checks every stored record against its declaration:

```bash
dimensions lang validate evidence.dim
```

```
evidence/article-page.json:9:14: unknown-value: $[1].actor: "designer" is not a value of Actor (design-agent)
evidence/article-page.json:11:25: invalid-value: $[1].source.file: "/Users/me/website.pen" is not a RelativePath: a path from the repository root: parts split by /, none of them empty, . or .., and none with a \ or spaces at either end
```

Every field must be given, each of its type, and no others. Each problem has
its file, line and column, and its JSON path, so a person or an agent can go
straight to it. When everything is valid, the command prints what it checked:

```json
{
  "file": "evidence.dim",
  "stored": [{ "record": "Evidence", "folder": "evidence", "files": 1, "records": 2 }]
}
```

Records are the first step toward evidence that the language itself checks:
the next steps are fields of text, times and hashes, and a field that refers
to one combination of a type.

## When something is wrong

Every problem is reported as `file:line:column: code: message`, in the order
it appears in the file, and every one is reported at once, so you can fix them
all in one pass. The code is stable, for tools; the message is for reading,
and usually says what was expected or what to write instead.

There are two kinds:

- An **error** means the file cannot be used: `lang check` and `lang states`
  exit with code 1, and nothing is evaluated.
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
wordmark.dim:1:19: syntax-error: expected "|" or the end of the line after "rest", found "hovered"
```

Only the real mistake is reported: the missing `|`. `Hover` is still known to
be an enum, so the state that uses it is fine.

## What is still being designed

The language grows one concept at a time, and the concepts below are designed
or under discussion but not part of it yet; see [design.md](design.md):

- **Evidence the language checks.** Records and `lang validate` are the first
  steps. Next come fields that hold text, times and hashes, for when evidence
  was recorded and what it points to; a field that refers to one combination
  of a type in a profile, so the checker can tell that a piece of evidence is
  for a combination that exists; and where evidence is stored, so the tool can
  say what is drawn, built and verified, and what is missing.
- **Provides and cascade.** Today, profiles are the only things that give
  dimensions their values. Next, an element in a page will _provide_ a
  dimension, and every element inside it that _needs_ it will receive the
  value. That is dependency injection: `needs` is already its first half.
- **Modifiers.** Accessories that change some profiles' values, like an iPad
  with a Magic Keyboard.
- **Kits.** Domain words that alias the core, such as a UI kit, so the same
  language can describe other domains. `Tool` in the records above is already
  the pattern: the core knows nothing about pen.dev; a file or a kit declares
  it.

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
| state       | `hover`                       | lowercase letter                                    |
| record      | `Evidence`                    | capital letter                                      |
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
record      = "record" Name "{" { blank-line | field-name ":" Name newline } "}"
comment     = "#" to the end of the line
```

### Diagnostics

| Code                                                                          | Severity | When                                                                     |
| ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `syntax-error`                                                                | error    | the text does not follow the grammar                                     |
| `enum-name`, `dimension-name`, `type-name`, `environment-name`, `record-name` | error    | the name does not start with a capital letter                            |
| `state-name`, `profile-name`, `field-name`                                    | error    | the name does not start with a lowercase letter                          |
| `duplicate-name`                                                              | error    | a name is declared twice in the file                                     |
| `duplicate-value`                                                             | error    | a value appears twice in an enum, dimension or condition                 |
| `duplicate-state`                                                             | error    | a type has two states with one name                                      |
| `states-twice`                                                                | error    | a type has two `states` lines                                            |
| `duplicate-rule`                                                              | error    | a state value has two rules                                              |
| `duplicate-dimension`                                                         | error    | a dimension appears twice in a type's needs, an environment or a profile |
| `unknown-enum`                                                                | error    | a state's values come from something that is not an enum                 |
| `unknown-dimension`                                                           | error    | a name used as a dimension is not one                                    |
| `unknown-state`                                                               | error    | a rule names a state the type does not have                              |
| `unknown-value`                                                               | error    | a value is not one of its enum's or dimension's                          |
| `unneeded-dimension`                                                          | error    | a rule uses a dimension its type does not need                           |
| `unknown-environment`                                                         | error    | a profile's environment is not one                                       |
| `incomplete-profile`                                                          | error    | a profile leaves out a dimension of its environment                      |
| `mixed-profiles`                                                              | error    | profiles are instances of different environments                         |
| `duplicate-field`                                                             | error    | a record has two fields with one name                                    |
| `unknown-type`                                                                | error    | a field's type is not an enum, a record or a scalar                      |
| `recursive-record`                                                            | error    | a record contains itself                                                 |
| `reserved-name`                                                               | error    | a declaration has a built-in scalar's name                               |

Checking stored records with `lang validate` reports these, after any problem with the
JSON itself:

| Code            | When                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| `wrong-kind`    | a value is not the kind its place needs: a list, an object or a string |
| `missing-field` | a record leaves out one of its fields                                  |
| `unknown-field` | a record has a field its declaration does not                          |
| `unknown-value` | an enum field's value is not one of the enum's                         |
| `invalid-value` | a scalar field's value is not a valid value of the scalar              |
| `unused-need`   | warning                                                                | a type needs a dimension that no rule uses |
