# Commands

dxn's commands are `dxn <command> <file> ...`, each working on a file
written in dxn, the language of design and dimensions;
[language/guide.md](language/guide.md) teaches it and lists every
diagnostic code. The usage block below is the same text that
`dxn help <command>` and `dxn <command> --help` print, and a test keeps it
in sync.

## Global options

- `--dry-run` makes `attach` and `rename` print the files they would write,
  without writing them.
- `-h`, `--help` print the overview, or a command's usage when they come
  after a command.
- `-V`, `--version` print `{"version": "<version>"}`.

## Contents

[check](#check), [states](#states), [cases](#cases), [validate](#validate), [attach](#attach), [status](#status), [rename](#rename)

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
  profile laptop: Device { Pointer = mouse }

Commands:
  check <file>                       Parse and check a file; say what it declares,
                                     or report every problem it has. Warnings
                                     are printed, but do not fail.
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
  attach <file> <path> --file <f> --frame <id> [--field <name>=<value>]... <key>=<value>...
                                     Record a frame for each combination the
                                     context's keys give (a|b lists several) that
                                     exists in place, with its fingerprint; an
                                     entry for the same combination, frame and
                                     fields is replaced; with --dry-run, say what
                                     it would write
  status <file> [--missing]          Count, for each record with context, the
                                     combinations of every element in the file's
                                     trees, in place, and those a stored record is
                                     about; with --missing, list the others
  rename <file> <Enum>.<value> <new> Rename an enum's value in the file and in every
                                     stored record, once both check; with --dry-run,
                                     say what it would write

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

Records a frame as evidence for an element, by its path, in each combination the context's keys give, with its fingerprint.

```bash
dxn attach toolbar.dxn Toolbar.menu.toggle --file design/website.pen --frame l5Z3Z --field actor=design-agent profile=phone "menu.menu=closed|open"
```

### status

Counts, for each record with context, the combinations of every element in the file's trees and those a stored record is about; `--missing` lists the others.

```bash
dxn status toolbar.dxn
```

### rename

Renames an enum's value in the file and in every stored record.

```bash
dxn rename evidence.dxn Actor.design-agent designer
```
