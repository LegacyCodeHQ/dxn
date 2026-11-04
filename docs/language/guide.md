# dxn: a guide

This guide teaches dxn, the language of design and dimensions, one concept at
a time. Each section adds one idea, says why you need it, and ends with a file
you can check yourself. It covers the language as it is today; the last
section lists what is still being designed. The decisions behind it, and
the questions still open, are in [design.md](design.md). To try it end to
end first, with one button, see the [tutorials](../tutorials/README.md).

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
against the declarations, and kept in sync with them when a name changes, so
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
| `dxn rename`, which rewrites the stored data       | schema evolution: every stored value is typed, so a rename knows exactly which values to change                              |
| evidence that actors record as they draw and build | model-based testing: the model says which cases must exist, and the evidence records which ones the design and the code show |

Put together, dxn is a typed specification of what varies: every case can be
counted, and recorded evidence says which cases the real system shows.

## Your first file

A dxn file is plain text, and its name ends in `.dxn`. The `dxn check`
command reads one, reports any problems, and otherwise says in one line what
it declares:

```bash
dxn check wordmark.dxn
```

```
wordmark.dxn: 2 enums, 1 type
```

It needs no project, so you can try everything in this guide in an empty
folder. Seven commands work on a file, each introduced where it is needed:

| Command                                     | What it does                                                         |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `dxn check <file>`                          | reports every problem, or says what the file declares                |
| `dxn states <file> <Type or path>`          | evaluates a type, or a child in place: its states in each profile    |
| `dxn cases <file> <Type or path>`           | lists the cases that can be told apart, and what each covers         |
| `dxn validate <file>`                       | checks every stored record against its declaration                   |
| `dxn attach <file> <path> --actor --data …` | records evidence for an element in the combinations given            |
| `dxn status <file>`                         | counts which combinations have evidence, and which are stale or gone |
| `dxn review <file>`                         | writes a page per tree to review its evidence by, with pictures      |
| `dxn rename <file> <Enum>.<value> <new>`    | renames an enum's value in the file and its stored records           |

Each prints a readable answer for you. A tool or an agent adds `--json` to any
of them, and gets one JSON document instead: the answer with its `problems`,
the file and its problems when it fails, or `{ "error": … }` when the command
refuses.

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
next line, before or after a `|`, and can start its values on the line after
the `=`. A pipe is required between values, with none before the first or
following the last. Blank lines and comments can come
between the lines, so a value can be commented out:

```
enum Size = xs | sm | md |
  lg | xl

enum Size = xs
  # | sm
  | md
```

An enum can have a single value.

Why closed sets? Because a finite set can be counted. If `Hover` has two
values and `Focus` has two, there are exactly four combinations, and the tool
can list every one and tell you which you have not covered. An open set, like
"any string", could never be checked that way.

Three rules keep enums unambiguous:

- **An enum's name starts with a capital letter.** In this language, a name
  for a _set of possibilities_ is capitalized, as is every other name
  declared at the top of a file (a profile, a modifier, an actor), and a name
  for a _single thing_ inside one (a value, a state) starts with a lowercase
  letter. You can tell which one you are reading at a glance.
- **A value is lowercase letters and digits,** with single hyphens only
  between them: `rest`, `no-keyboard`, `19px`, but not `Rest`, `hovered-` or
  `hov--ered`. So no two values differ only in case. A value can be a
  keyword, such as `on`, but not `when` or `else`, which start a derived
  state and a `when`'s last branch.
- **Each value appears once,** and each name is declared once in the file.

## Types and states

An enum on its own is just a set of values. To say that the wordmark _has_ a
hover and a focus, declare a **type**:

```
enum Hover = rest | hovered
enum Focus = blurred | focused

type Wordmark {
  state hover: Hover, focus: Focus
}
```

A type is the kind of element you are describing. Each `state` line declares
one or more of its state fields, split by commas: each has a lowercase name, a
colon, and the enum its values come from. A type has as many `state` lines as
it needs, so a state can have a line, and a comment, of its own:

```
type Link {
  state hover: Hover, focus: Focus
  # the current page's link is selected
  state selection: Selection
}
```

A type's states are independent of each other, so the wordmark above can be
in any of the four combinations of hover and focus. You can ask the tool for
them:

```bash
dxn states wordmark.dxn Wordmark
```

```
| hover         | focus            |
| ------------- | ---------------- |
| rest, hovered | blurred, focused |
```

Each state has a column, listing the values it can have: every value, because
nothing yet says otherwise. That is about to change.

The checker holds you to what you declared. Misspell a state's enum, or name
a state with a capital letter, and it says so, with the line and column:

```
wordmark.dxn:3:23: error: state-name: state names start with a lowercase letter: `Focus`
wordmark.dxn:3:30: error: unknown-enum: `Focus` is not an enum (`Hover`)
```

## Nested declarations: what belongs to a type

Some enums and types only make sense inside one type: a menu's open or closed
state, or the button that opens it. Listing them all at the top of the file
hides which type they belong to. They can be declared inside it instead:

```
enum Hover = rest | hovered

type Menu {
  enum State = closed | open
  state menu: State

  type Toggle {
    state hover: Hover
    state expanded: State
  }
}

type Toolbar {
  state menu: Menu.State
}
```

Inside `Menu`, its enum is just `State`, and a type nested in it, like
`Toggle`, sees it by that name too: a declaration sees everything declared
around it, and at the top of the file. Outside, each is named after the type
it is in: `Menu.State`, `Menu.Toggle`. `Hover` stays at the top, because
several types use it.

```bash
dxn states menu.dxn Menu.Toggle
```

```
| hover         | expanded     |
| ------------- | ------------ |
| rest, hovered | closed, open |
```

A nested name is not visible from a sibling, only from inside its own type.
Written `state menu: State` in `Toolbar`, it is reported, with the names that
would do:

```
menu.dxn:14:15: error: unknown-enum: `State` is not an enum (`Hover`, `Menu.State`)
```

And it cannot repeat a name from around it, so a bare name always means one
thing: an `enum Hover` inside `Menu`, with `Hover` at the top, is a
`duplicate-name`. A type sees what is declared around it, but not the states
of the types around it: those it has to be given.

## Dimensions: what the world varies by

A hovered state only makes sense with a mouse, and a focused one only with a
keyboard. Whether the reader has a mouse or a keyboard is not something the
wordmark decides: it is a fact about the world the wordmark is shown in. A
fact that varies like this is a **dimension**:

```
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
```

A dimension is something the world varies by, such as the screen size or the
kind of pointer, not a size: its values are names, like `sm`, never
measurements.

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
  state hover: Hover, focus: Focus
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
wordmark.dxn:5:29: error: unneeded-dimension: `Wordmark` does not need `Pointer`; declare `type Wordmark needs Pointer`
```

A need is also a use on its own: a type that needs a dimension can differ
by it, even with no rule on it. A wordmark drawn bigger on a large screen
needs the screen size, and nothing more. A need that makes no difference at
all, declared alike throughout and used by nothing else, is a warning, so a
stale need does not linger unnoticed:

```
logo.dxn:2:17: warning: unused-need: `Logo` needs `Screen`, but nothing in it uses it, and it is alike throughout
```

A warning does not fail the check: the file is still usable. `alike` comes
later, in its own section.

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
  state hover: Hover, focus: Focus
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
  state hover: Hover
  hover = hovered only when Breakpoint in (lg, xl)
}
```

A condition can join comparisons with `and`, where all of them hold, or with
`or`, where one does. Each comparison is on a dimension the type needs:

```
dimension Breakpoint = base | sm | lg | xl
dimension Pointer = mouse | touch
enum Hover = rest | hovered

type BlogLink needs Breakpoint, Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse and Breakpoint in (lg, xl)
}
```

`and` and `or` mix only in brackets, so the order is always written, never
left to a rule of precedence. Without them, the error gives both ways to
bracket it:

```
link.dxn:7:65: error: syntax-error: `and` and `or` need brackets to mix: write `(Pointer = mouse and Breakpoint = lg) or Breakpoint = xl` or `Pointer = mouse and (Breakpoint = lg or Breakpoint = xl)`
```

Brackets nest, and a pair around a whole condition, or around one comparison,
changes nothing. There is no `not`: every dimension's values are listed, so
`not Pointer = touch` is always `Pointer = mouse`, or an `in` of the others.

A condition is checked as a whole too. In one `and`, each dimension is
compared once: `Pointer = mouse and Pointer = touch` is a
`repeated-comparison`, since its values can be given once, with `in`. One
that is never true is an error, since the value would exist nowhere; one that
is always true is a warning, since the rule restricts nothing. Never and
always are judged against the combinations the type really has: with its
other rules, its fixed and derived states, and its profiles. A condition on
`enabled = enabled` is never true where another rule leaves only `disabled`:

```
link.dxn:7:3: error: impossible-condition: `(Pointer = mouse and Breakpoint = lg) and (Pointer = touch and Breakpoint = lg)` is never true, so `hovered` exists nowhere
link.dxn:7:3: warning: vacuous-condition: `Pointer = mouse or Pointer = touch` is always true, so the rule restricts nothing
```

Each state value has at most one rule, so there is a single place to read
where it exists, and no question of whether a second one adds to the first,
narrows it or replaces it. A second rule for the same value is an error,
which gives the one rule to write instead:

```
link.dxn:8:3: error: duplicate-rule: `hover = hovered` already has a condition at line 7; join them in one: `hover = hovered only when Pointer = mouse and Keyboard = keyboard`
```

A long condition carries on to the next line, before or after an `and` or an
`or`, and inside brackets, so each part can have a comment of its own:

```
hover = hovered only when Pointer = mouse   # touch has no hover
  and enabled = enabled                     # nor does a disabled button
```

A line break never changes the order: `and` and `or` still mix only in
brackets.

A condition can also compare another of the type's own states, where two
states are not independent: a disabled button is never hovered.

```
dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered

type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  hover = hovered only when Pointer = mouse and enabled = enabled
}
```

The matrix then has a row for each value of a state another depends on, and
shows that state next to the dimensions, since it says where the row is. So
every row still reads one state at a time:

```
| Breakpoint | layout  |
| ---------- | ------- |
| base       | compact |
| sm         | compact |
| lg         | inline  |
| xl         | inline  |
```

A state can depend on one that depends on another, but no state can depend
on itself, directly or through others:

```
button.dxn:7:29: error: rule-cycle: `focus` depends on `hover`, which depends on `focus`; no state can depend on itself
```

## When: a state the world decides

Hover is a state the reader changes: both values happen, and rules only say
where each can. Some states are not like that. The toolbar is compact on
narrow screens and lays its links out in line on wide ones: nobody switches
it, and at each screen size it is exactly one. That is a **derived** state,
and a `when` says what it is:

```
dimension Breakpoint = base | sm | lg | xl
enum Layout = compact | inline

# The toolbar is compact on narrow screens, and lays its links out in line
# on wide ones.
type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base, sm -> compact
    lg, xl -> inline
  }
}
```

Each line of the `when` lists some of the dimension's values and, after
`->`, the state's value for them. Every value of the dimension is covered,
exactly once, so the state has exactly one value in each row:

```
| Pointer | enabled  | hover         |
| ------- | -------- | ------------- |
| mouse   | enabled  | rest, hovered |
| mouse   | disabled | rest          |
| touch   | enabled  | rest          |
| touch   | disabled | rest          |
```

A value left out is reported, not quietly given a default:

```
toolbar.dxn:7:31: error: incomplete-when: `when Breakpoint` does not cover `xl`
```

Unless the `when` says so with `else`, its last branch, which gives one value
to every value the others do not list:

```
state layout: Layout = when Breakpoint {
  base, sm -> compact
  else -> inline
}
```

An `else` also covers a value added to the dimension later, without a
report, so it is for a value that stands for "anything else", not for
saving a line. An `else` with nothing left to cover is a warning,
`unused-else`.

The dimension must be one the type needs, as for a rule. A derived state is
declared on a `state` line of its own, and has no `only when` rules: its
`when` already decides it.

A state can also be **fixed**: one value, always. The article page is the
blog's page, so which section is current is decided once:

```
type ArticlePage {
  state current: Section = blog
}
```

Like a derived state, a fixed state has no rules, no action can change it,
and a parent cannot bind it. A stored context still gives its value, which
must be the fixed one, as a derived state's must be the one its `when` gives
there.

## Has: what a type contains

An element is often made of others. The toolbar holds the wordmark, and, by
its layout, either the links or a menu; the menu holds its toggle, and a panel
while it is open. A type says what it contains with **has**:

```
dimension Breakpoint = base | sm | lg | xl
enum Layout = compact | inline

type Wordmark {}
type Links {}

type Menu {
  enum State = closed | open
  state menu: State

  type Toggle {}
  type Panel {}

  has toggle: Toggle
  has panel: Panel only when menu = open
}

type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base, sm -> compact
    lg, xl -> inline
  }
  has wordmark: Wordmark
  has links: Links only when layout = inline
  has menu: Menu only when layout = compact
}
```

Each `has` line names a child, lowercase like a state, and gives its type. A
child is always there unless `only when` says where: on one of the type's own
states (`layout = compact`, `menu = open`), or on a dimension it needs
(`Breakpoint in (lg, xl)`). The case of the name tells which: a lowercase name
is a state, a capitalized one a dimension. Its condition is written as a
rule's, with `and`, `or` and brackets, and can compare states and dimensions
together: `only when menu = open and Breakpoint = base`. A child that is never
there is an error, and one that is always there a warning. A child's own children come from
its type, so the tree nests as deep as the types do.

The matrix shows where each child is:

```bash
dxn states toolbar.dxn Toolbar
```

```
| Breakpoint | layout  | has wordmark | has links | has menu |
| ---------- | ------- | ------------ | --------- | -------- |
| base       | compact | ✓            | —         | ✓        |
| sm         | compact | ✓            | —         | ✓        |
| lg         | inline  | ✓            | ✓         | —        |
| xl         | inline  | ✓            | ✓         | —        |
```

Where a child depends on a free state, the cell says for which of its values
it is there:

```
| menu         | has toggle | has panel   |
| ------------ | ---------- | ----------- |
| closed, open | ✓          | menu = open |
```

Where it depends on several free states, the cell gives its condition:
`menu = open and (size = big or Breakpoint = lg)`.

A child's name is unique in its type, among its children and its states; its
type must be a type; and a type cannot contain itself, directly or through
its children, since the tree would have no end. Like everything a type uses,
a condition sees only the type's own states and the dimensions it needs, not
the states of the types around it.

### Bindings: a state a child is given

The menu's toggle shows ☰ while the menu is closed and ✕ while it is open. It
does not decide that: it shows the menu's state. The toggle declares the
state, and the menu sets it where it places the toggle, with a **binding**:

```
type Menu {
  enum State = closed | open
  state menu: State

  type Toggle needs Pointer, Keyboard {
    state hover: Hover, focus: Focus
    state expanded: State             # closed: ☰ Menu; open: ✕ Close
  }

  has toggle: Toggle { expanded = menu }
}
```

`{ expanded = menu }` reads: the toggle's `expanded` is the menu's `menu`.
On its own, `Toggle` is self-contained, with an `expanded` that can be
either; placed in the menu, it always follows the menu. Both states must take
their values from one enum, and each of the child's states is set at most
once. A state the child decides itself cannot be set: one a `when` or a value
decides, one it receives, or one its own actions change. The bindings come
right after the child's type, before any `only when`.

A binding can also **fix** a child's state to one of its values: wherever
the parent places it, that state is always that value. A screen's tab bar is
always on its own section:

```
type FeedScreen {
  has tabs: TabBar { section = feed }
}
```

`{ section = feed }` reads: the tab bar's `section` is always `feed`. A
lowercase name after `=` is one of the parent's states when the parent has a
state of that name, and otherwise a value of the child's state, which must be
one of its values. A name that is both, a state of the parent and a value of
the child's state, is reported, `ambiguous-binding`, rather than read one way
or the other: rename one of them.

### Lists: one or more of a type

A feed shows articles, as many as there are. A child whose type is in
brackets is a **list**: one or more of its type.

```
type FeedScreen {
  enum Content = articles | empty
  state content: Content

  has articles: [ArticleRow] only when content = articles
  has follow: Button { style = primary } only when content = empty
}
```

Each row can be in any of `ArticleRow`'s combinations, so the list adds no states:
five rows are not five times the states. A list that is there has at least
one row. No rows is the list not being there, which its `only when` decides,
so a screen that can be empty says so with a state of its own, as `content`
does here, and shows something else there, or nothing. A list without an
`only when` is never empty.

Bindings set every row's states: `[ArticleRow] { reading = unread }` is a
list of unread rows.

A list can have rows of several kinds. Its **members** go one on each line
inside the brackets, each a tag and a type, with its own bindings and its own
`only when`:

```
type FeedScreen {
  enum Plan = free | paid
  state plan: Plan

  has feed: [
    article: ArticleRow
    ad: AdRow only when plan = free
  ]
}
```

Each row is one of the members: an article or, on the free plan, an ad, in
any mix, and the list has at least one row. This is a **tagged union**: the
choices are closed, nothing but what the list names, and each carries its
tag, which tells them apart even when two are of one type,
`unread: ArticleRow { reading = unread }` and `read: ArticleRow { reading =
read }`. Each member is a child of the type in place, by its path,
`FeedScreen.feed.ad`, counted and recorded as any child is; the list itself
has no combinations. An `only when` after the `]` is the whole list's, every
member's too. Bindings go on each member's line, never after the `]`, since
the members may be of different types. A member that adds no rows, whose
every row another member of its type allows too, is a warning,
`redundant-member`.

### Provided and received: a state from far above

A state lives in the lowest type that all its users share: the menu's in the
menu, since the toggle and the panel both follow it. Some states have users
far below: which section the page is, which decides whether the toolbar's
blog link is selected. Passing it down level by level would make every type
between carry it. Instead, the type that owns it **provides** it, and the
types that need it **receive** it:

```
enum Section = home | blog

type ArticlePage {
  state current: Section = blog
  provides current
  has toolbar: Toolbar
}

type Links receives current: Section {
  has blog: Link only when current = blog
}
```

`Toolbar`, between the page and the links, says nothing about it. A type
declares what it receives on its first line, after what it needs, with the
enum it expects; inside, a received state is used like one of its own, in
conditions and bindings, but it has no rules and no parent can bind it. A
type provides only its own states, each once: not one it receives itself.

A received state often decides a child's own state rather than whether it is
there: the blog link is always there, but selected only on the blog's pages.
A binding can map one state onto another with a `when`, a branch for each of
its values, split by commas or lines:

```
type Links receives current: Section {
  has blog: ToolbarLink {
    selection = when current { blog -> selected, home -> unselected }
  }
}
```

Like every `when`, it covers each value of the state it is on once, and each
branch gives a value of the child's state. In place, the blog link is
selected exactly where the page is the blog's.

Where a received state comes from is known in place: the nearest type above
on the path that provides it, with the same enum. In place, it is one of
the parents' states, by its provider's name:

```bash
dxn states site.dxn ArticlePage.toolbar.links.blog
```

```
| current | selection |
| ------- | --------- |
| blog    | selected  |
```

On its own, a receiving type has the state free, with every value; and a
path where nothing above provides it is refused, by `dxn states`, by
`dxn status`, and by an expectation that reaches it:

```
dxn: `current` is received by `Links`, but nothing above it provides it
```

### In place: a child inside its parents

`dxn states` on a type gives what that type can be on its own. A child
inside a page is narrower: it is only where its parents put it, and some of
its states are set by them. Give `dxn states` a path from a type, and it
evaluates the child in place:

```
dimension Breakpoint = base | sm | lg | xl
dimension Pointer = mouse | touch
dimension Keyboard = keyboard | no-keyboard
enum Hover = rest | hovered
enum Focus = blurred | focused
enum Layout = compact | inline

type Menu {
  enum State = closed | open
  state menu: State

  type Toggle needs Pointer, Keyboard {
    state hover: Hover, focus: Focus
    state expanded: State
    hover = hovered only when Pointer = mouse
    focus = focused only when Keyboard = keyboard
  }

  has toggle: Toggle { expanded = menu }
}

type Toolbar needs Breakpoint {
  state layout: Layout = when Breakpoint {
    base, sm -> compact
    lg, xl -> inline
  }
  has menu: Menu only when layout = compact
}

environment Device = Breakpoint x Pointer x Keyboard
profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
```

```bash
dxn states toolbar.dxn Toolbar.menu.toggle
```

```
In every row: Phone, Breakpoint = base, Pointer = touch, Keyboard = no-keyboard, layout = compact

| menu.menu | hover | focus   | expanded |
| --------- | ----- | ------- | -------- |
| closed    | rest  | blurred | closed   |
| open      | rest  | blurred | open     |
```

For each profile, it walks down the path: the toolbar is `compact` on a phone,
so the menu is there; the menu can be `closed` or `open`; and in each, the
toggle is there, with `expanded` set to match. On a laptop the toolbar is
`inline`, so there is no menu, and no toggle: no row. Its parents' states
that decide where it is, or that it is given, are named by their path:
`layout` is the toolbar's, `menu.menu` the menu's. What is the same in every
row is said once, above the table: the toggle is only ever there on a phone,
where the toolbar is `compact`; the rest varies, row by row.

## Evaluating: the matrix

This is where the language pays off. Ask for the wordmark's state again:

```bash
dxn states wordmark.dxn Wordmark
```

```
| Pointer | Keyboard    | hover         | focus            |
| ------- | ----------- | ------------- | ---------------- |
| mouse   | keyboard    | rest, hovered | blurred, focused |
| mouse   | no-keyboard | rest, hovered | blurred          |
| touch   | keyboard    | rest          | blurred, focused |
| touch   | no-keyboard | rest          | blurred          |
```

There is one row for each combination of the dimensions the type needs, in
the order it needs them, and each state's cell lists the values it has there.
This table is the matrix the introduction talked about: every case the wordmark
has to handle, worked out from four lines of rules. A designer can draw from
it, a developer can build from it, and nobody has to guess which cases exist.

The table is drawn to be read: a key the same in every row is said once, above
it, and where every row is on every profile, there is no profiles column.
With `--json`, the command prints the full matrix as JSON instead, a row for
each world, for tools and agents.

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
  state hover: Hover, focus: Focus
  hover = hovered only when Pointer = mouse
  focus = focused only when Keyboard = keyboard
}

environment Device = Breakpoint x Pointer x Keyboard

profile Phone: Device { Breakpoint = base, Pointer = touch, Keyboard = no-keyboard }
profile Tablet: Device { Breakpoint = lg, Pointer = touch, Keyboard = no-keyboard }
profile Laptop: Device { Breakpoint = lg, Pointer = mouse, Keyboard = keyboard }
```

A profile's name is capitalized, as a type's is. After the colon
comes the environment it is an instance of, then a value for each of that
environment's dimensions, split by commas or lines.

Now the matrix has one row per profile instead of one per combination. Rows
that read the same are one row, naming every profile in it: the wordmark does
not need `Breakpoint`, so on a phone and on a tablet it is the same:

```
| profiles      | Pointer | Keyboard    | hover         | focus            |
| ------------- | ------- | ----------- | ------------- | ---------------- |
| Phone, Tablet | touch   | no-keyboard | rest          | blurred          |
| Laptop        | mouse   | keyboard    | rest, hovered | blurred, focused |
```

These are the cases that matter, named the way the team talks about them.

A profile must be complete and correct: every dimension of its environment,
once, with one of its values. All profiles in a file share one environment, so
they can be compared row by row.

```
wordmark.dxn:16:54: error: unknown-value: `pen` is not a value of `Pointer` (`mouse`, `touch`)
wordmark.dxn:18:9: error: incomplete-profile: `Laptop` does not give `Keyboard`, which `Device` requires
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
  state hover: Hover, tone: Tone
  hover = hovered only when Pointer = mouse
  tone = inverted only when Theme = dark
}

environment Device = Pointer
profile Phone: Device { Pointer = touch }
profile Laptop: Device { Pointer = mouse }
```

```
| profiles | Pointer | Theme | hover         | tone            |
| -------- | ------- | ----- | ------------- | --------------- |
| Phone    | touch   | light | rest          | plain           |
| Phone    | touch   | dark  | rest          | plain, inverted |
| Laptop   | mouse   | light | rest, hovered | plain           |
| Laptop   | mouse   | dark  | rest, hovered | plain, inverted |
```

## Modifiers: accessories that change a profile

Some devices change with an accessory. A tablet is a touch screen without a
keyboard, until it gets a keyboard with a trackpad: then it has a mouse and a
keyboard, and the wordmark can be hovered and focused on it. That is not a new
device, and it fits more than one: it is a **modifier**.

```
modifier MagicKeyboard on Tablet {
  Pointer = mouse, Keyboard = keyboard
}
```

A modifier's name is capitalized, like a profile's. After `on` come the
profiles it fits, split by commas, and in braces the dimensions it sets, as in
a profile; the dimensions it does not set keep the profile's values. For each
profile it is on, it makes one more, named `<profile>+<modifier>`, and the
matrix has a row for it:

```
| profiles                      | Pointer | Keyboard    | hover         | focus            |
| ----------------------------- | ------- | ----------- | ------------- | ---------------- |
| Phone, Tablet                 | touch   | no-keyboard | rest          | blurred          |
| Laptop, Tablet+MagicKeyboard | mouse   | keyboard    | rest, hovered | blurred, focused |
```

A tablet with the magic keyboard has the same values as the laptop, so the
two are one combination, and share a row that names them both. Nothing about
either is lost: both stay declared, and a context still names the one profile
its evidence was recorded on, `"profile": "Laptop"` or
`"profile": "Tablet+MagicKeyboard"`, which then counts for the whole row. If
the two ever differ, the row splits, and each piece of evidence stays with the
profile it named. In JSON, each row of `dxn states` lists its `profiles`.

A modifier sets dimensions of the profiles' environment, each once, with one
of their values, and is on profiles that exist. One that changes nothing on a
profile it is on is a warning, since that profile already exists:

```
wordmark.dxn:20:19: warning: unchanged-profile: `Magic` changes nothing on `Laptop`, which already has `Keyboard = keyboard`
```

## Alike: what cannot be told apart

Two combinations can differ in the matrix and still be impossible to tell
apart. A button at rest looks the same on a touch screen as with a mouse:
the pointer decides whether it can be hovered, not how it looks at rest. To
draw, build or test it, there are fewer cases than combinations. **alike**
says which:

```
dimension Pointer = mouse | touch
enum Enabled = enabled | disabled
enum Hover = rest | hovered

type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  hover = hovered only when Pointer = mouse and enabled = enabled
  alike Pointer
}
```

`alike Pointer` reads: combinations that differ only in the pointer cannot
be told apart. `dxn cases` lists the cases that can. Where a case covers
more than one combination, it says what it covers: its profiles, when the
file has profiles, or otherwise each combination, by the values the case
does not show:

```bash
dxn cases button.dxn Button
```

```
Button: 3 cases of 5 combinations

| enabled  | hover   | combinations                     |
| -------- | ------- | -------------------------------- |
| enabled  | rest    | Pointer = mouse; Pointer = touch |
| enabled  | hovered | Pointer = mouse                  |
| disabled | rest    | Pointer = mouse; Pointer = touch |
```

Without `alike`, every combination is its own case, and `dxn cases` lists
them one by one: `Button: 5 cases`. With `--combinations`, it lists every
combination even where some are alike, to see what `alike` merged. Only what a type
declares can tell its combinations apart: its own states and the dimensions
it needs. A dimension that only the types around it need never does. A logo
drawn bigger on a large screen needs the screen size; an icon that is the
same on every screen does not, and it is one case wherever it is placed.

`alike` can also make some values alike, with `in`, and only where a
condition holds, with `when`:

```
alike Breakpoint in (lg, xl)                      # lg and xl cannot be told apart
alike hover in (rest, hovered) when selection = selected
```

It is on one of the type's states or a dimension it needs, and `in` names
two or more of its values. With `--json`, each case lists the values that
tell it apart and every combination it covers.

## Records: plain data

Everything so far describes the matrix: what an element's states are, and
where each one exists. But the tools around the matrix also keep data about
it. When a designer draws a combination, the evidence they record says
when, and where the drawing is; when a reviewer looks at it, the review says
what they decided, and why. That data has a shape, and a shape is worth
checking just as much as the states are.

A **record** is that shape: a named group of typed fields.

```
enum Verdict = approved | changes

record Comment {
  # what the reviewer wrote
  text: NonEmptyString
}

record Review {
  verdict: Verdict
  comment: Comment
}
```

A record's name is capitalized, like every other set of possibilities. Its
fields come one to a line, each a lowercase name, a colon, and its type: an
enum (`Verdict`), another record (`Comment`), or a scalar (`NonEmptyString`,
below). A short record can sit on one line:
`record Note { text: NonEmptyString }`.

A record is not a type. A type is an element: it needs dimensions and has
states that come and go with them. A record is plain data, with nothing that
varies: every field is given, every time. That is also why a record cannot
contain itself, directly or through other records: it could never be written
down.

```
recursive-record: `Review` contains itself: `Review.comment` is a `Comment`, and `Comment.reply` is a `Review`
```

### Scalars: values that are checked, not listed

Some data can never be an enum: the moment evidence was recorded, for
instance, is one of endlessly many. A **scalar** is a built-in type whose
values are checked rather than listed:

| Scalar           | A valid value                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Timestamp`      | an ISO 8601 date and time with a time zone, e.g. `2026-10-31T08:50:05Z`                                                                                               |
| `NonEmptyString` | at least one character, with no spaces at either end and no control characters                                                                                        |
| `RelativePath`   | a path from the repository root: parts split by `/`, none of them empty, `.` or `..`, none with a `\` or spaces at either end, nor starting with a drive such as `C:` |

Scalars only type a record's fields. A state or a dimension cannot have
one: their values must be listed, so a type's combinations can always be
counted. A scalar's name is built in, so a file cannot declare it.

One record is built in as well: **`PenNode`**, a node of a pen.dev design
file. It is how a record says where a drawing is, and what the drawing was
when it was recorded:

| Field         | What it holds                                                                         |
| ------------- | ------------------------------------------------------------------------------------- |
| `file`        | the design file, a `RelativePath`                                                     |
| `frame`       | the frame the drawing is in, a `NonEmptyString`                                       |
| `node`        | the node inside the frame, a `NonEmptyString`; left out when the drawing is the frame |
| `fingerprint` | the node's fingerprint, or the frame's without a node, when it was recorded           |

The design file's path is relative to the nearest Git root above the `.dxn`
file, including a worktree's `.git` file. Outside Git it is relative to the
`.dxn` file's directory. The CLI and editor use the same rule; running a command
from another directory does not change which drawing it reads. Outside Git,
paths previously written relative to the CLI working directory may need updating.

The frame is there even with a node: when the node is deleted, the frame
still says where it was. With them, `Evidence` can hold everything a designer
records: when, and where the drawing is.

```
record Evidence {
  at: Timestamp
  source: PenNode
}
```

Who records it is the next section but one.

### Derived fields: what follows from another field

Some of a record's data follows from another field: what happens next
follows from a review's verdict. A field can be derived with a `when`, as a
state can:

```
enum Verdict = approved | changes
enum Next = ship | redraw

record Review {
  verdict: Verdict
  next: Next = when verdict {
    approved -> ship
    changes -> redraw
  }
}
```

A derived field is an enum's, on another field of the record, not itself,
that is an enum's and is not derived itself, and its `when` covers every
value of that field once. It is not stored: its value always follows, so a stored record
that gives it is reported.

### Actors: who records a fact about one combination

Evidence is always about one case of the matrix: _this_ drawing shows the
wordmark on a laptop, in the dark theme, hovered. Someone records it, and is
responsible for it: an actor. An actor is declared with the record it
records, one record each, and is named as records are, with a capital letter
and then letters and digits:

```
actor DesignAgent records Evidence
```

A record an actor records is stored, each one a fact about one combination:
it has a context. Every stored `Evidence` then has a `context`: the one row of
`dxn states` it is about. The field is not listed among the record's fields,
because every record an actor records has it, in the same shape:

| Part         | What it holds                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `type`       | the type it is about                                                                                      |
| `profile`    | the profile, when the file declares profiles; it fixes the dimensions it gives                            |
| `dimensions` | a value for each dimension the type needs that the profile does not give, or all of them without profiles |
| `states`     | a value for every state of the type                                                                       |

```json
"context": {
  "type": "Wordmark",
  "profile": "Laptop",
  "dimensions": { "Theme": "dark" },
  "states": { "hover": "hovered", "tone": "inverted" }
}
```

A context is always complete: one exact cell, nothing left out and nothing
extra. Dimensions and states each have their own group, so a state can be
named anything, even `profile`. And it is checked against the matrix, not
only against the enums: `hovered` is a value of `hover`, but there is no
hovered wordmark on a phone, so a context that says so is reported.

Evidence is usually about one element on a page, not about any element of a
type: _this_ toggle, inside _this_ toolbar's menu. Such a context names the
child by its path instead of a type, and is one row of `dxn states` for that
path, with the parents' states that place it:

```json
"context": {
  "path": "Toolbar.menu.toggle",
  "profile": "Phone",
  "dimensions": {},
  "parents": { "layout": "compact", "menu.menu": "closed" },
  "states": { "hover": "rest", "focus": "blurred", "expanded": "closed" }
}
```

A context names a `type` or a `path`, never both. A path starts at a type
nothing contains, so it names one element of a tree. With a path, the dimensions
are those of every type on the way, and `parents` gives each parent state
that decides where the child is or that it is given, by its path. It is
checked against the child in place: it must be there in that world, with
those parents, and its bound states must be the ones its parents give it.

```
evidence/toolbar.json:14:21: error: unknown-value: $[0].context.states.expanded: `open` is not a value of `expanded` on `Phone` with `layout = compact`, `menu.menu = closed` (`closed`)
```

Only a record an actor records can be stored, since stored data is a fact
about the matrix. Such a record cannot be a field of another record, which
would give it a second context, and it cannot declare a field named
`context`, nor, since the actor is stored with it, one named `actor`. A
record no actor records, like `Comment`, is a part of the facts
that contain it.

### Where records are stored, and checking them

A record's data is stored by convention, so no declaration has to say where:
**a record is stored in a folder named after it, next to the file that
declares it.** The folder's name is the record's name in kebab-case, with no
plural: `Evidence` is stored in `evidence/`, `DesignReview` in
`design-review/`. Every `.json` file in the folder holds a list of the record,
so the data can be split across as many files as you like:

```
evidence.dxn                # declares Evidence, and the actor who records it
evidence/
  wordmark.json             # [ {…}, {…} ]
  menu-button.json
```

A record with no folder is not stored: `Comment` above only ever appears
inside `Review`, so it needs none. Only a record an actor records can have
a folder; for any other, `dxn validate` stops before checking anything:

```
dxn: `Comment` is stored in comment/, but no actor records it; declare `actor <name> records Comment`
```

Each stored record is an object with its `context`, its `actor`, the name
of an actor who records it, and a key for every field: a record field holds an object, an enum field one of the enum's values
as a string, and a scalar field a string that is a valid value of the scalar.

```json
[
  {
    "context": {
      "type": "Wordmark",
      "profile": "Laptop",
      "dimensions": { "Theme": "dark" },
      "states": { "hover": "hovered", "tone": "inverted" }
    },
    "actor": "DesignAgent",
    "at": "2026-10-31T08:50:05Z",
    "source": {
      "file": "design/website.pen",
      "frame": "R353q",
      "fingerprint": "8056e176dcb1b7aa7e3c6ce6aee142848862fa5a"
    }
  }
]
```

`dxn validate` checks every stored record against its declaration:

```bash
dxn validate evidence.dxn
```

```
evidence/wordmark.json:19:28: error: unknown-value: $[1].context.states.hover: `hovered` is not a value of `hover` on `Phone`, `Theme dark` (`rest`)
evidence/wordmark.json:21:14: error: unknown-actor: $[1].actor: `Designer` is not an actor who records `Evidence` (`DesignAgent`)
```

Every field must be given, each of its type, and no others, and the actor
must be one who records the record. Two stored records that are the same in
everything but their PenNodes' fingerprints, which only say what a drawing
was when it was recorded, are duplicates, in one file or across the
record's files; `dxn attach` replaces a stored record rather than making one. Each
problem has its file, line and column, and its JSON path, so a person or an
agent can go straight to it. When everything is valid, the command says what
it checked, a line for each stored record:

```
evidence.dxn: Evidence, 2 stored records in 1 file in evidence/
```

### Attaching: recording evidence

An actor records evidence with `dxn attach`: the element by its path, the
actor with `--actor`, the record's fields as one JSON object with `--data`,
and the context as `key=value` pairs, the same keys a context has. Every key
is given, and `a|b` lists several values: it records one stored record for each
combination listed that exists in place.

```bash
dxn attach toolbar.dxn Toolbar.menu.toggle --actor DesignAgent \
  --data '{"at": "2026-10-31T08:50:05Z", "source": {"file": "design/website.pen", "frame": "l5Z3Z"}}' \
  profile=Phone layout=compact "menu.menu=closed|open" \
  hover=rest focus=blurred "expanded=closed|open"
```

```
Attached 2 stored records to evidence/toolbar.json
```

Of the four combinations listed, two exist: the toggle is expanded exactly
when its menu is open. The record is the one the actor records, here
`Evidence`. Each PenNode is given without its fingerprint: `dxn attach`
checks that the file is there, that the frame is in it and the node in the
frame, and computes the fingerprint itself, of the node, or of the frame
without one. In a pen.dev file, a fingerprint covers the node and the
components and variables it uses, but not where it sits; in any other file,
it is the whole file's.

```
dxn: node "OcEJ9" is not in frame l5Z3Z of design/website.pen
```

Recording the same combination and fields again replaces the stored record, with the
fingerprint the node has now, in whichever of the record's files it
is stored. The file is relative to the repository, and a new stored record goes in
the record's folder, in a file named after the type the path starts at.

### Status: what has evidence, and what is missing

With evidence recorded for children, `dxn status` says how much of the
model it covers: every combination of every element in the file's trees, in place,
and which of them a stored record is about. An element's combinations in place are
its own: its states and the dimensions it needs. Its parents decide which of
them occur, but never add any, so two places that differ only in a parent's
state, and give the element the same states, are one combination of it.

A type declared at the top of the file is also a **component**: it is counted
on its own, as a tree of its own, though another type contains it, so a design
system can draw each of its components once, in all its combinations. A stored record about
an element, on its own or in any of its places, also covers it everywhere
else it is, in the same combination: the same states, dimensions and profile. A
type declared inside another is a part of it, counted only in place; and a
type that receives a state from its parent cannot be on its own, so it is
counted only in place too.

```bash
dxn status toolbar.dxn
```

```
toolbar.dxn: Evidence 38/55 combinations recorded

| path                                | combinations | recorded | stale | gone | missing |
| ----------------------------------- | ------------ | -------- | ----- | ---- | ------- |
| ArticlePage                         | 1            | 0        | 0     | 0    | 1       |
| ArticlePage.toolbar                 | 4            | 0        | 0     | 0    | 4       |
| ArticlePage.toolbar.wordmark        | 15           | 15       | 0     | 0    | 0       |
| ArticlePage.toolbar.links           | 2            | 0        | 0     | 0    | 2       |
| ArticlePage.toolbar.links.blog      | 9            | 9        | 0     | 0    | 0       |
| ArticlePage.toolbar.menu            | 4            | 2        | 0     | 0    | 2       |
| ArticlePage.toolbar.menu.toggle     | 12           | 12       | 0     | 0    | 0       |
| ArticlePage.toolbar.menu.panel      | 2            | 0        | 0     | 0    | 2       |
| ArticlePage.toolbar.menu.panel.blog | 6            | 0        | 0     | 0    | 6       |
```

A tree starts at each type that no type contains, and every child below it
is an element, by its path. Profiles that differ only in dimensions an
element does not have count as one combination of it, as in `dxn cases`:
the page has no dimensions, so it is one combination on every profile, and
the menu is the same on a tablet with or without its keyboard. Evidence on
any of a combination's profiles covers it.

Each stored record is also checked against its drawings: each PenNode it has. A
PenNode is **recorded** while its fingerprint, of its node or, without one,
its frame, is the one recorded, **stale** once that has changed, and
**gone** once the file, the frame or the node is, or the node is no longer
in its frame. A stored record is as its least fresh PenNode is, and a combination
as its best stored record is, or **missing** without one. A stored record made before its element gained a state or a dimension does not say which value of it the drawing shows, so it matches no combination: it is counted apart as **outdated**, and `dxn validate` warns of it rather than fails, until it is given the value. A record with no PenNode
is counted as recorded, and the first line says that staleness is not
checked, so it never passes silently. Attaching again records the
fingerprint now, and the stored record is recorded again.

With `--missing`, it lists each combination that is not recorded, under
Missing, Stale and Gone, in the words a context would use:

```
Missing:
  ArticlePage: current = blog
  ArticlePage.toolbar.menu on TabletPortrait, TabletPortrait+MagicKeyboard with toolbar.layout = compact: menu = closed
```

With `--json`, every count is a number, and each path lists the combinations
that are not recorded under `listed`, as `stale`, `gone` and `missing`.

### Renaming a value

An enum's values are stored as text, so renaming one by hand leaves every
stored record that used it invalid. `dxn rename` renames it everywhere at
once: in the enum; wherever the file writes a value of it, in rules,
children's conditions, bindings, fixed and derived states, actions,
expectations and derived fields; and in every stored record's fields of that
enum, nested ones included, and in the states of every context.

```bash
dxn rename evidence.dxn Hover.hovered over
```

```
Renamed Hover.hovered to over in evidence.dxn, evidence/wordmark.json (2 values)
```

It only touches the value where it means that enum's value: the same text in
another enum, a dimension, or a string field stays as it is, and so does the
rest of each file, comments and spacing included. It refuses a new name that
is already a value or is not written like one, and it changes nothing while
the file or its stored records have problems, so a rename never mixes with
them. A rename that would leave a problem of its own, such as a rule over
elements whose states of one name come from different enums, is refused,
with the problems it would leave. A rename in an editor, through the
language server, refuses the same, showing the first problem. Add
`--dry-run` to see what it would
rename, without writing: `Would rename Hover.hovered to over in …`;
with `--json` as well, it prints every file it would write, in full.

With these, evidence is checked by the language itself: its shape, its
values, and that the combination it is about exists.

## Actions and on: how a state changes

The matrix says which combinations exist; it does not say how the system
moves between them. A menu is closed, then open, then closed again, and what
makes it change is part of the design. An **action** names one change of a
type's own state, from one of its values to another; an **on** says which
event triggers it:

```
type Toggle {
  event activate
  state expanded: Menu.State
  state focus: Focus
  action take-focus: focus blurred -> focused
}

type Menu {
  enum State = closed | open
  event escape
  state menu: State
  has toggle: Toggle { expanded = menu }
  has panel: Panel only when menu = open

  action open: menu closed -> open
  action close: menu open -> closed

  on toggle.activate: open
  on toggle.activate: close
  on escape: close, toggle.take-focus
  on panel.blog.activate: close, toggle.take-focus
}
```

An action's name is its own: not the name of one of the type's states or
children, so a name in a type always means one thing. An action changes a
state the type owns: not one a `when` or a value decides,
nor one it receives. Those follow from something else, so no action can change
them. Nor can a parent bind a state one of its child's actions changes: bound,
its value is the parent's. An action changes something: its `from` and `to`
are two values. It applies only in its `from` value: `close` does nothing
while the menu is closed. That is how one event can mean two things: a click
on the toggle opens a closed menu and closes an open one.

A trigger can also write its change in place, with no action to name: one
of the type's own states, and the value it changes to.

```
type Button {
  event activate, cancel
  state press: Press
  on activate: press -> pressed
  on cancel: press -> released
}
```

`press -> pressed` applies wherever `press` is not yet `pressed`, as an
action applies only in its `from` value, and it is checked as an action is:
a state the type owns, a value of it. Name a change as an action when it is
part of the type's interface: when a parent calls it, as the toolbar calls
`menu.close`, or when several triggers make it, as the menu's `close` is made
by Escape, a link and a click outside. Write it in place when it belongs to
one trigger, where a name would only repeat the value. A change in place is
always on the type's own states; a child's are changed through its actions.

An event is a name the type declares, with `event`, lowercase like a state,
each once: `event escape, outside`. The language gives no event a meaning of
its own: `escape` is whatever the type says it is, so the same triggers
describe a menu, an order or a connection. An event in `on` is one of:

- one the type declares: `on escape`;
- one a child declares, by the child's path: `on toggle.activate`, `on
  panel.blog.activate`. The child receives it, and the parent decides what it
  does;
- a change of a **dimension** the type needs: `Breakpoint in (lg, xl)`, or
  `Breakpoint = lg`.

An event that is not declared is an `unknown-event`, with the ones there are.

An `on` can trigger a child's action by its path, so a parent decides what
its own events do to what it contains:

```
type Toolbar needs Breakpoint {
  ...
  on wordmark.activate: menu.close
  on outside: menu.close
  on Breakpoint in (lg, xl): menu.close, links.blog.take-focus
}
```

A trigger can make several changes, split by commas, in the order written:
its own actions, a child's, and changes in place. It changes each of its
type's own states at most once:

```
on escape: close, toggle.take-focus
on activate: lamp -> on, bell -> on
```

A trigger can fire only where a condition holds, written at its end with
`only when`, as a rule's and a child's are. A key presses a button only
while it is focused:

```
on activate: press -> pressed only when focus = focused
```

The condition is checked as any other: on the type's states and the
dimensions it needs, never true an error and always true a warning. Two
triggers for one event are not ambiguous when their conditions can never
both hold.

Moving focus is no word of the language's own: the child that takes it
declares an action for it, and a trigger calls that action as it calls any
child's, as in `close, toggle.take-focus`:

```
type Toggle {
  state focus: Focus
  action take-focus: focus blurred -> focused
}
```

One event makes one change: two actions that one event triggers, its own or
a child's, cannot both apply to the same value, and one event does not
trigger the same action twice. Events overlap when they are the same event,
or a change of one dimension to a value they share: `Breakpoint in (base,
lg)` and `Breakpoint = lg` overlap. A dimension an event changes is one the
type needs, as for a rule.

## Expectations: rules the model must follow

Some things must stay true however the model changes: touch screens never
show hover; the menu's panel only exists while the menu is open. An
**expectation** writes such a rule down, and `dxn check` checks it against
the tree in place, every time:

```
expect "Touch screens never show hover" {
  in ArticlePage.toolbar and below
  when Pointer = touch
  then hover = rest
}

expect "A Desktop link can be hovered and focused at once" {
  in ArticlePage.toolbar.links.blog
  when profile = Desktop
  some hover = hovered, focus = focused
}

expect "The menu panel only exists while the menu is open" {
  in ArticlePage.toolbar.menu.panel
  when toolbar.menu.menu = closed
  absent
}
```

The title is the rule in words, in quotes, once in the file. `in` names the
element by its path; with `and below`, every element under it too, each that
has every key the rule names. `when` picks its combinations by the keys a
context has: `profile`, a dimension, one of its states, or a parent's state
by its key in place. A profile a modifier makes is named as `dxn states`
names it: `when profile = TabletPortrait+MagicKeyboard`. Then one
assertion:

- **then**: every combination picked has these values;
- **some**: at least one has all of these values at once;
- **absent**: the element is not there in any of them.

With `on`, the assertion is about what happens after the event: the action
the element's own type triggers on it is applied to every combination `when`
picks. A trigger a parent has on
the element's action, like the toolbar's `on wordmark.activate: menu.close`, is
not applied yet.

```
expect "Escape closes the menu" {
  in ArticlePage.toolbar.menu
  when menu = open
  on escape
  then menu = closed
}
```

After an event, `then` can also name a child's state by its path, and it is
checked against what the event's trigger changes in that child, through the
child's actions:

```
type Menu {
  has toggle: Button
  on escape: close, toggle.take-focus
}

expect "Escape closes the menu and the toggle takes focus" {
  in Page.menu
  when menu = open
  on escape
  then menu = closed, toggle.ring = visible
}
```

A child's state the event does not change fails the rule, saying so.

Where the event fires nothing in a combination picked, the element stays as
it was, and the rule is checked on it unchanged: `when focus = blurred`, `on
activate`, `then press = released` holds for the button above. Where that
does not hold, the rule fails, saying nothing happens.

A change that breaks a rule is an error, with one combination that breaks
it:

```
toolbar.dxn:154:8: error: expectation-failed: Touch screens never show hover: `ArticlePage.toolbar.wordmark` on `Phone` has `hover = hovered`
```

A rule that picks nothing would always pass, so it is an error too: a
profile that is not one, a key no element has, a value its key does not
have, a path that leads nowhere, or one to an element that cannot be placed.

```
toolbar.dxn:194:8: error: expectation-empty: Nothing tests nothing: no element in `ArticlePage.toolbar.links` has `colour`
```

## When something is wrong

Every problem is reported as `file:line:column: severity: code: message`, in
the order it appears in the file, and every one is reported at once, so you can
fix them all in one pass. A problem in stored data also has its JSON path:
`file:line:column: severity: code: path: message`. The code is stable, for tools; the
message is for reading, and usually says what was expected or what to write
instead.

There are two kinds:

- An **error** has `error:` before its code. The file cannot be used: every
  command exits with code 1, and nothing is evaluated, validated or renamed.
- A **warning** has `warning:` before its code. The file is still usable, and
  the command still succeeds.

With `--json`, problems are not printed as lines but listed in the one JSON
document, each with its `file`, `line`, `column`, `severity`, `code` and
`message`, and its `path` in stored data:

```json
{
  "file": "evidence.dxn",
  "problems": [
    {
      "file": "evidence/wordmark.json",
      "line": 21,
      "column": 14,
      "severity": "error",
      "code": "unknown-actor",
      "path": "$[1].actor",
      "message": "`Designer` is not an actor who records `Evidence` (`DesignAgent`)"
    }
  ]
}
```

A mistake in one declaration does not cause a cascade of others. The tool
reports the mistake, keeps whatever it read of that declaration, and carries
on from the next line that starts a declaration. Uses of a declaration that
did not parse are not reported again:

```
enum Hover = rest hovered
type Wordmark {
  state hover: Hover
}
```

```
wordmark.dxn:1:19: error: syntax-error: expected `|` or the end of the line after `rest`, found `hovered`
```

Only the real mistake is reported: the missing `|`. `Hover` is still known to
be an enum, so the state that uses it is fine. The same holds inside a type:
a broken enum or type in it is not reported again where it is used. And a
declaration left open, with its `}` missing, is reported where the next
declaration starts, at the start of a line, which then reads as its own.
Where every brace is closed, the braces say what is inside a type, so a
declaration moved into one belongs to it even before it is indented, and
`dxn fmt` indents it.

## What is still being designed

The language grows one concept at a time, and the concepts below are designed
or under discussion but not part of it yet:

- **Provided state, checked by `dxn check`.** A receiving type placed where
  nothing above provides its state is found today when the path is
  evaluated: by `dxn states`, `dxn status` or an expectation. `dxn check`
  could find it as soon as the `has` is written.
- **Events and where things are.** An `on` that calls a child's action, such
  as `toggle.take-focus`, does not yet say whether that child must be there
  before the event or after it.
- **Expectations on a parent's triggers,** and on a dimension event, which
  would also move the dimension to its new value. A child's state can be
  checked after an event, but not yet without one.
- **Dimension keys below a path.** `when Pointer = touch` with `and below`
  applies only to the elements whose types need `Pointer`, even where every
  profile gives it.
- **More renames.** `dxn rename` renames an enum's value. Renaming a field,
  a record (and its folder), or an enum, dimension or type is still to come.
- **A runtime.** Evidence today is recorded by the actors that draw and
  build. A runtime would check the real system itself, driving a browser or a
  device into each combination and recording what it shows.
- **Evidence against `alike`.** Two combinations of one case recorded with
  different frames, or two cases with one frame, are not reported yet.
- **Kits.** Domain words that alias the core, such as a UI kit, so the same
  language can describe other domains. Actors are already the pattern: the
  core knows nothing about any particular actor; a file or a kit declares
  them. `PenNode` is built in for now, and would belong to a design kit. Events are the same: a UI kit could declare the usual ones,
  such as `activate` and `escape`, for every type to use.

### What the language leaves out

The language says what exists: the states, what they depend on, and which
combinations happen. It does not say what anything looks like: no colors,
sizes or icons. It can say which combinations cannot be told apart, with
`alike`, but not how they look; evidence shows that: the design frame each
case was drawn in, and later the rendering in the code.

## Reference

### Words

The words dxn and an editor say the model's facts in, each for one thing.
Each is said the same by both: the dxn command for agents, an editor for
people.

| Word          | Means                                                                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| combination   | one value of each state and each dimension of an element: what evidence is counted against. `Tab`, with two selections and three interactions, has six.                                                                                                                                                           |
| recorded      | a combination's status when a stored record matches it, and its drawings, where it has any, are as they were recorded; else it is stale, gone or missing. A count says how many: `2/6 combinations recorded`                                                                                                      |
| stale         | a combination's status when its stored record's drawing has changed since it was recorded: its fingerprint no longer matches. The evidence moved away from the model; look at the drawing, and record it again if it is right. Not outdated, where the model moved                                                |
| gone          | a combination's status when its stored record's drawing no longer exists: its file, frame or node was deleted                                                                                                                                                                                                     |
| missing       | a combination's status when no stored record matches it                                                                                                                                                                                                                                                           |
| set apart     | a stored record with a problem, not counted until it is fixed: dxn status and an editor say how many, `· 1 set apart`, and what most of them say, `1 of 2 stored records says hover = bogus, which Hover does not have (rest, hovered)`                                                                           |
| outdated      | a stored record made before its element gained a state or a dimension, which says no value of it: `` `hover` was added to `Button` after it was recorded ``. The model moved away from the evidence; it is a warning, counted apart, and its value is added to count it again. Not stale, where the drawing moved |
| stored record | one item of a record's stored files: a fact about one combination, recorded by an actor. A record is what a file declares, `record Evidence`; it is never one of these                                                                                                                                            |

### Names

| Kind        | Example                       | Written                                         |
| ----------- | ----------------------------- | ----------------------------------------------- |
| enum        | `Hover`                       | capital letter, then letters and digits         |
| dimension   | `Pointer`                     | capital letter, then letters and digits         |
| type        | `Wordmark`                    | capital letter, then letters and digits         |
| environment | `Device`                      | capital letter, then letters and digits         |
| record      | `Evidence`                    | capital letter, then letters and digits         |
| actor       | `DesignAgent`                 | capital letter, then letters and digits         |
| state       | `hover`                       | lowercase letter                                |
| profile     | `Laptop`                      | capital letter, then letters and digits         |
| child       | `toggle`                      | lowercase letter                                |
| action      | `close`                       | lowercase letter                                |
| modifier    | `MagicKeyboard`               | capital letter, then letters and digits         |
| field       | `source`                      | lowercase letter                                |
| value       | `rest`, `no-keyboard`, `19px` | lowercase letters, digits, hyphens between them |

Letters are ASCII, `a` to `z` and `A` to `Z`; no name or value has an
underscore.

An enum or a type can be declared inside a type, and is then named after it
from outside: `Menu.State`, `Menu.Toggle`. A name is looked up first in the
type it is used in, then in the types around it, then at the top of the file.

Every enum, dimension, type, environment, profile, modifier, record and actor shares
one namespace: each name is declared once in a file.

### Grammar

```
file        = { blank-line | comment | enum | dimension | type | environment | profile | modifier | record | actor | expect }
enum        = "enum" Name "=" ( value | [lines] "|" value ) { [lines] "|" [lines] value } newline
dimension   = "dimension" Name "=" ( value | [lines] "|" value ) { [lines] "|" [lines] value } newline
type        = "type" Name [ "needs" Name { "," [newline] Name } ] [ "receives" field { "," [newline] field } ]
              "{" { blank-line | state | rule | enum | type | has | provides | events | action | on | alike } "}"
alike       = "alike" name [ "in" "(" value { "," value } ")" ] [ "when" condition ] newline
action      = "action" action-name ":" state-name value "->" value newline
on          = "on" event ":" change { "," change } [ "only" "when" condition ] newline
change      = path | state-name "->" value                      # path: an action, or a child's
event       = path | comparison                                  # path: an event the type declares, or a child's
events      = "event" event-name { "," event-name } newline
provides    = "provides" state-name newline
has         = "has" child-name ":" ( ( type-name | "[" type-name "]" ) [ bindings ] | members ) [ "only" "when" condition ] newline   # [ ]: one or more
members     = "[" newline member { member } "]"                     # a tagged union: each row one of them
member      = child-name ":" type-name [ bindings ] [ "only" "when" condition ] newline
type-name   = Name { "." Name }
bindings    = "{" { binding ( "," | newline ) } "}"
binding     = state-name "=" state-name                # or a value of the child's state, which fixes it
            | state-name "=" "when" state-name "{" { branch ( "," | newline ) } "}"
state       = "state" field { "," [newline] field } newline
            | "state" field "=" "when" Name "{" { branch ( "," | newline ) } "}" newline
            | "state" field "=" value newline
branch      = value { "," value } "->" value       # a when's branches are split by commas or lines
            | "else" "->" value                   # the last, for every value the others do not list
field       = state-name ":" Name { "." Name }
rule        = state-name "=" value "only" "when" condition newline
condition   = term { [newline] "and" [newline] term } | term { [newline] "or" [newline] term }   # mixed only in brackets
term        = comparison | "(" [newline] condition [newline] ")"
comparison  = name ( "=" value | "in" "(" value { "," value } ")" )   # on a dimension the type needs, or one of its states
environment = "environment" Name "=" Name { "x" [newline] Name } newline
profile     = "profile" profile-name ":" Name "{" { assignment ( "," | newline ) } "}"
modifier    = "modifier" modifier-name "on" profile-name { "," [newline] profile-name } "{" { assignment ( "," | newline ) } "}"
assignment  = Name "=" value
record      = "record" Name "{" { blank-line | record-field } "}"
record-field = field-name ":" Name { "." Name } [ "=" "when" field-name "{" { blank-line | branch } "}" ] newline
actor       = "actor" Name "records" Name newline
expect      = "expect" string "{" "in" path [ "and" "below" ] [ "when" pairs ] [ "on" event ] ( ( "then" | "some" ) pairs | "absent" ) "}"
pairs       = key "=" value { "," key "=" value }       # key: profile, a dimension, a state, or a parent's state;
                                                        # after an event, a child's state by its path
                                                        # a profile's value may be <profile> "+" <modifier>
comment     = "#" to the end of the line
lines       = newline { blank-line | comment newline }   # in an enum or a dimension, between its values
```

### Diagnostics

| Code                                                                                                                         | Severity | When                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `syntax-error`                                                                                                               | error    | the text does not follow the grammar                                                             |
| `enum-name`, `dimension-name`, `type-name`, `environment-name`, `record-name`, `actor-name`, `profile-name`, `modifier-name` | error    | the name does not start with a capital letter, or has more than letters and digits               |
| `state-name`, `field-name`, `child-name`                                                                                     | error    | the name does not start with a lowercase letter                                                  |
| `action-name`                                                                                                                | error    | an action's name does not start with a lowercase letter                                          |
| `value-name`                                                                                                                 | error    | a value is not lowercase letters and digits, with single hyphens between, or is `when` or `else` |
| `duplicate-name`                                                                                                             | error    | a name is declared twice in the file, or an expectation's title                                  |
| `duplicate-value`                                                                                                            | error    | a value appears twice in an enum, dimension, condition or `when`                                 |
| `duplicate-state`                                                                                                            | error    | a type has two states with one name                                                              |
| `duplicate-rule`                                                                                                             | error    | a state value has two rules; the message gives the one rule that joins them                      |
| `duplicate-dimension`                                                                                                        | error    | a dimension appears twice in a type's needs, an environment, a profile or a modifier             |
| `unknown-enum`                                                                                                               | error    | a state's values come from something that is not an enum                                         |
| `unused-enum`                                                                                                                | warning  | no state or record field takes an enum's values; not with a syntax error, or the enum twice      |
| `unknown-dimension`                                                                                                          | error    | a name used as a dimension is not one                                                            |
| `unknown-state`                                                                                                              | error    | a rule, a child's condition, a binding, a `provides` or an action names a state it does not have |
| `unknown-value`                                                                                                              | error    | a value is not one of its enum's or dimension's                                                  |
| `unneeded-dimension`                                                                                                         | error    | a rule, a `when`, a child condition or an event uses a dimension its type does not need          |
| `incomplete-when`                                                                                                            | error    | a `when` leaves out a value of its dimension                                                     |
| `unused-else`                                                                                                                | warning  | a `when`'s `else` covers nothing: its other branches cover every value                           |
| `repeated-comparison`                                                                                                        | error    | a dimension or state is compared twice in one `and`                                              |
| `impossible-condition`                                                                                                       | error    | a rule's or a child's condition is never true                                                    |
| `vacuous-condition`                                                                                                          | warning  | a rule's or a child's condition is always true                                                   |
| `alike-one-value`                                                                                                            | error    | an `alike` with `in` names one value, which is alike only with itself                            |
| `rule-on-derived`                                                                                                            | error    | a rule is on a state that a `when` or a value decides, or that is received                       |
| `rule-cycle`                                                                                                                 | error    | a state depends on itself through rules' conditions on other states                              |
| `unknown-field`                                                                                                              | error    | a derived field's `when` is on a field the record does not have                                  |
| `unknown-environment`                                                                                                        | error    | a profile's environment is not one                                                               |
| `incomplete-profile`                                                                                                         | error    | a profile leaves out a dimension of its environment                                              |
| `mixed-profiles`                                                                                                             | error    | profiles are instances of different environments                                                 |
| `unknown-profile`                                                                                                            | error    | a modifier is on a profile that is not one                                                       |
| `duplicate-profile`                                                                                                          | error    | a modifier lists a profile twice                                                                 |
| `unchanged-profile`                                                                                                          | warning  | a modifier changes nothing on a profile it is on                                                 |
| `duplicate-field`                                                                                                            | error    | a record has two fields with one name                                                            |
| `unknown-type`                                                                                                               | error    | a field's type is not an enum, a record or a scalar, or a child's type is not a type             |
| `recursive-record`                                                                                                           | error    | a record contains itself                                                                         |
| `duplicate-child`                                                                                                            | error    | a type has two children, or a child and a state, with one name                                   |
| `recursive-type`                                                                                                             | error    | a type contains itself through its children                                                      |
| `duplicate-binding`                                                                                                          | error    | a binding sets a child's state twice                                                             |
| `binding-mismatch`                                                                                                           | error    | a binding's two states take their values from different enums                                    |
| `ambiguous-binding`                                                                                                          | error    | a binding's right side is both a state of the type and a value of the child's state              |
| `bound-derived`                                                                                                              | error    | a binding sets a child's state that a `when` or a value decides, or that it receives             |
| `duplicate-provides`                                                                                                         | error    | a type provides a state twice                                                                    |
| `provides-received`                                                                                                          | error    | a type provides a state it receives, not one of its own                                          |
| `duplicate-action`                                                                                                           | error    | an action has the name of another action, or of a state or a child of its type                   |
| `bound-action`                                                                                                               | error    | a binding sets a child's state that one of the child's actions changes                           |
| `action-on-derived`                                                                                                          | error    | an action changes a state that a `when` or a value decides, or that is received                  |
| `unchanged-action`                                                                                                           | error    | an action's from and to are one value, so it changes nothing                                     |
| `unknown-child`                                                                                                              | error    | an event, an action's path or a focus names a child that is not one                              |
| `unknown-action`                                                                                                             | error    | an `on` triggers an action its type does not have                                                |
| `ambiguous-event`                                                                                                            | error    | events that overlap trigger two actions that apply to one state's same value                     |
| `duplicate-trigger`                                                                                                          | error    | an event triggers the same action twice                                                          |
| `unknown-event`                                                                                                              | error    | an event in `on` is not one its type, or the child it names, declares                            |
| `event-name`                                                                                                                 | error    | an event's name does not start with a lowercase letter                                           |
| `duplicate-event`                                                                                                            | error    | a type declares an event twice                                                                   |
| `conflicting-change`                                                                                                         | error    | a trigger changes one of its type's states twice                                                 |
| `expectation-failed`                                                                                                         | error    | the model breaks an expectation; the message gives a combination that breaks it                  |
| `expectation-empty`                                                                                                          | error    | an expectation picks nothing, so it would always pass                                            |
| `derived-field`                                                                                                              | error    | a derived field is not an enum's, or is on a field that is not an enum's, or is derived          |
| `nested-context`                                                                                                             | error    | a record's field is a record an actor records, which would be a second context                   |
| `reserved-name`                                                                                                              | error    | a declaration has a built-in name, or a recorded record has a field named `context` or `actor`   |
| `unrecorded-record`                                                                                                          | error    | records are stored for a record no actor records; its stored records are not checked             |
| `unused-need`                                                                                                                | warning  | a type needs a dimension that is alike throughout and that nothing in it uses                    |

Checking stored records with `dxn validate` reports these, after any problem with the
JSON itself:

| Code               | When                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrong-kind`       | a value is not the kind its place needs: a list, an object or a string                                                                                                 |
| `missing-field`    | a record leaves out one of its fields, its context, or a part of its context                                                                                           |
| `unknown-field`    | a record or a context has a field its declaration does not                                                                                                             |
| `unknown-value`    | an enum field's value is not one of the enum's; or a context's type, profile, dimension or state value is not one of the file's, or does not exist in that combination |
| `invalid-value`    | a scalar field's value is not a valid value of the scalar                                                                                                              |
| `derived-field`    | a stored record gives a derived field, whose value follows from another's                                                                                              |
| `unknown-actor`    | a stored record's actor is not one who records it                                                                                                                      |
| `outdated`         | (a warning) a stored record leaves out a state or a dimension its element gained since it was recorded                                                                 |
| `duplicate-record` | two stored records are the same in everything but their PenNodes' fingerprints                                                                                         |
| `drawing-mismatch` | a stored record's pen.dev drawing shows a type of the model more or less often than its element has it in its combination                                              |
| `redundant-member` | (a warning) a list's member allows no row another member of its type does not                                                                                          |
