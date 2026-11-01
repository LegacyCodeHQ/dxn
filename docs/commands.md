# Commands

dxn's commands are `dxn <command> <file> ...`, each working on a file
written in dxn, the language of design and dimensions;
[language/guide.md](language/guide.md) teaches it and lists every
diagnostic code. The usage block below is the same text that
`dxn help <command>` and `dxn <command> --help` print, and a test keeps it
in sync.

## Global options

- `--dry-run` makes `attach`, `review` and `rename` print the files they would write,
  without writing them.
- `-h`, `--help` print the overview, or a command's usage when they come
  after a command.
- `-V`, `--version` print `{"version": "<version>"}`.

## Contents

[check](#check), [fmt](#fmt), [states](#states), [cases](#cases), [validate](#validate), [attach](#attach), [status](#status), [review](#review), [rename](#rename)

## Usage

```text
Usage: dxn <command> <file> [options]

dxn, the language of design and dimensions, which grows one concept at a
time: see docs/language/guide.md. A .dxn file declares enums, each a named
set of values; dimensions, each listing the values the environment varies
by; types with the dimensions they need, their states, rules for when a
state's value exists, a when for a state the world decides, and the
children they have; environments, each a product of dimensions; profiles,
each an instance of an environment; modifiers, accessories that change
some profiles; records, each a named group of typed fields; and
expectations, rules checked against the tree in place. A # starts a
comment, to the end of the line:

  # The wordmark's hover only exists with a mouse.
  enum Hover = rest | hovered
  dimension Pointer = mouse | touch
  type Wordmark needs Pointer {
    state hover: Hover
    hover = hovered only when Pointer = mouse
  }
  environment Device = Pointer
  profile Laptop: Device { Pointer = mouse }

Commands:
  check <file> [--expect <title>]    Parse and check a file; say what it declares,
                                     or report every problem it has. Warnings
                                     are printed, but do not fail. With
                                     --expect, run only the expectation with
                                     that title, and say whether it holds
  fmt <file>... [--check]            Write each file the one way a .dxn file is
                                     written, and name the files changed; with
                                     --check, write nothing, name the files not
                                     written that way, and fail if there are any
  states <file> <type>               Evaluate a type: the states it has in each
                                     profile, or without profiles under each
                                     combination of the dimensions it needs,
                                     as a Markdown table; or a child in place,
                                     given its path from a type, such as
                                     Toolbar.menu.toggle: where it is inside its
                                     parents, with the states they give it
  cases <file> <type>                List the cases a type, or a child in place,
        [--combinations]             has: those that can be told apart, each
                                     with what it covers where it covers more
                                     than one combination; with --combinations,
                                     every combination, as if nothing were
                                     alike
  validate <file>                    Check the stored records: each record's data is
                                     every JSON file in a folder named after it in
                                     kebab-case, next to the file, each a list of
                                     records with every field given, each of its
                                     type, and no others. Print what it checked, or
                                     every problem with its line, column and path
  attach <file> <path> --actor <name> --data <json> <key>=<value>...
                                     Record, as the actor, the record it records,
                                     for each combination the context's keys give
                                     (a|b lists several) that exists in place:
                                     --data gives its fields as JSON, and each
                                     PenNode's fingerprint is taken now, of its
                                     node or else its frame; an entry for the same
                                     combination, actor and data is replaced; with
                                     --dry-run, say what it would write
  status <file> [--missing]          Count, for each record an actor records, the
                                     combinations of every element in the file's
                                     trees, in place, and those a stored record is
                                     about; with --missing, list the others
  review <file>                      Write, for each tree and each record with a
                                     PenNode, a Markdown page of its combinations,
                                     each with its status and the picture of what
                                     was recorded, pictures/<node>.png beside the
                                     page; pages go in dxn's cache, outside the
                                     repository, and are named as they are written
  rename <file> <name> <new>         Rename a declaration where the file uses it
                                     and where stored records name it, once both
                                     check: <name> as dxn writes it (Hover,
                                     Hover.rest, Toolbar.layout, Phone, ...;
                                     <kind>:<name> where one name names two), or
                                     <file>:<line>:<column> <new> by its place; a
                                     record's stored records move to the folder of
                                     its new name; with --dry-run, say what it
                                     would write

Options:
  --json                             Print one JSON document, for tools: the result
                                     and any warnings as "problems"; on a failure,
                                     the file and its problems; on a refusal or
                                     a usage error, {"error": "<message>"}, with
                                     any problems found before a refusal
```

Each command prints a readable answer by default, and one JSON document with `--json`. Every command prints the usage above with `--help`.

## Commands

### check

Says what a file declares, in one line, or prints each problem as `<file>:<line>:<column>: <code>: <message>` and exits 1.

```bash
dxn check wordmark.dxn
dxn check wordmark.dxn --json
```

With `--expect`, it runs only the expectation with that title, written with or
without its quotes, and says it holds, or reports why it fails. The rest of the
file is still checked: an expectation cannot hold in a file with problems.

```bash
dxn check toolbar.dxn --expect "Escape closes the menu and returns focus to its button"
```

### fmt

Writes each file the one way a `.dxn` file is written, as `gofmt` does for Go,
and names the files it changed. There are no options: every file reads the
same, and a diff shows a change to the model, not to its spacing.

- Two spaces of indentation for each `{`; a line starting with `}` steps back,
  and one that goes on with `|`, `and` or `or` steps in one more.
- One space between words and around `=`, `->` and `|`; none before `:` or
  `,` and one after; none around `.` or `+`; none inside `( … )`; one inside
  `{ … }` on a line.
- Comments kept as written; one after code, two spaces after it.
- At most one blank line in a row, and none at the start of the file, after a
  `{` or before a `}`; line feeds, and one at the end.
- Nothing reordered, joined or split. A file that does not parse is left
  alone, and its problems are reported.

```bash
dxn fmt toolbar.dxn
dxn fmt --check spec/*.dxn
```

With `--check`, it writes nothing, names the files that are not written that
way, and exits 1 if there are any: for CI. The editor extensions format a file
the same way when it is saved.

### states

Prints a type's states in each profile or combination as a Markdown table; given a path from a type, a child's states in place.

```bash
dxn states wordmark.dxn Wordmark
```

### cases

Lists the cases a type or a child in place has, those that can be told apart, with what each covers; with `--combinations`, every combination.

```bash
dxn cases button.dxn Button
```

### validate

Checks every stored record, the JSON files in a kebab-case folder named after each record, next to the file; a problem in stored data also has its JSON path.

```bash
dxn validate evidence.dxn
```

### attach

Records evidence for an element, by its path, in each combination the context's keys give, as an actor: the record that actor records, with the fields `--data` gives as JSON. Each `PenNode` field gets its fingerprint now, of its node, or of its frame when it has none; `dxn status` later tells, by it, whether the design still shows what was recorded.

```bash
dxn attach gazette.dxn Button --actor DesignAgent \
  --data '{"source": {"file": "gazette.pen", "frame": "IeCCz", "node": "uqEAm"}}' \
  style=filled press=pressed enabled=enabled
```

### status

Counts, for each record an actor records, the combinations of every element in the file's trees and those a stored record is about; `--missing` lists the others.

```bash
dxn status toolbar.dxn
```

### review

Writes, for each tree and each record with a `PenNode`, a Markdown page to review its evidence by: a row for each combination, with its status as `dxn status` judges it, present, stale, gone or missing, and the picture of what was recorded. A stale row shows its drawing as it was when it was recorded, so it can be compared with the design as it is now. The pages go in dxn's cache, outside the repository: `~/Library/Caches/dxn/review/` on macOS, `~/.cache/dxn/review/` elsewhere, then the repository and the path of the record's folder in it. Each picture is `pictures/<node>.png` beside its page, or `pictures/<frame>.png` for a PenNode without a node; whoever attaches the evidence exports it there.

```bash
dxn review gazette.dxn
```

```
Wrote ~/Library/Caches/dxn/review/task-tree-1a2b3c4d/examples/gazette/pen-evidence/button.md
```

### rename

Renames a declaration everywhere the file uses it, and everywhere stored
records name it: in their contexts' paths, profiles, dimensions, parents and
states, and in their fields. Renaming a record moves its stored records to the
folder named after its new name.

A declaration is named as dxn writes it: an enum, a type, a dimension, a
record, an environment, a profile or a modifier by its name, one declared
inside a type by its full name (`Menu.State`), a value with its enum or
dimension (`Hover.rest`, `Breakpoint.sm`), and a state, an action, an event or
a child with its type (`Toolbar.layout`). Where one name names two, such as an
event and an action, a kind before it says which (`event:Menu.close`). A name
can also be given by its place in the file, as an editor does.

```bash
dxn rename evidence.dxn Hover.hovered over
dxn rename toolbar.dxn Toolbar.layout arrangement
dxn rename toolbar.dxn:96:9 arrangement
dxn rename toolbar.dxn Evidence Proof
```

A state that is provided is renamed with every state that receives it. The
rename is refused, and nothing is written, when the file or the stored
records would not check afterwards.
