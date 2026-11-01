# Commands

The language's commands are `dxn <command> <file> ...`, and the JSON
prototype's are `dxn prototype <command> ...`, kept until the prototype is
retired. The usage blocks below are the same text that `dxn help <command>`
and `dxn <command> --help` print (`dxn prototype help <command>` and
`dxn prototype <command> --help` for the prototype's), and a test keeps them
in sync. For the language, see [language/guide.md](language/guide.md). For
the ideas behind the prototype's commands, see [concepts.md](concepts.md);
for what they print, see [output.md](output.md).

## Global options

- `--dir <directory>` uses that project directory instead of the nearest
  `.dxn` in the working directory or above.
- `--dry-run` makes an editing command print the files it would write, as
  JSON, without writing them.
- `-h`, `--help` print the overview, or a command's usage when they come
  after a command. Neither needs a project.
- `-V`, `--version` print `{"version": "<version>"}`.

## Contents

- Language: [check](#check), [states](#states), [cases](#cases), [validate](#validate), [attach](#attach), [status](#status), [rename](#rename)
- Prototype: [overview](#prototype)
  - Project: [workflow](#prototype-workflow), [init](#prototype-init), [validate](#prototype-validate), [status](#prototype-status)
  - Explore: [tree](#prototype-tree), [show](#prototype-show), [contexts](#prototype-contexts), [views](#prototype-views), [view](#prototype-view), [axes](#prototype-axes), [transitions](#prototype-transitions), [evidence](#prototype-evidence)
  - Record: [verify](#prototype-verify), [unverify](#prototype-unverify), [attach](#prototype-attach), [detach](#prototype-detach)
  - Model: [node](#prototype-node), [fragment](#prototype-fragment), [type](#prototype-type), [state-group](#prototype-state-group), [attribute](#prototype-attribute), [check](#prototype-check), [dimension](#prototype-dimension), [profile](#prototype-profile), [modifier](#prototype-modifier), [override](#prototype-override), [expectation](#prototype-expectation), [actor](#prototype-actor)

## Language

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
                                     are printed, but do not fail. Needs no
                                     project.
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
                                     a usage error, {"error": "<message>"}
```

Works on files written in dxn, the language of design and dimensions, which grows one concept at a time; [language/guide.md](language/guide.md) teaches it and lists every diagnostic code. Each prints a readable answer by default, and one JSON document with `--json`. Every language command prints the usage above with `--help`.

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

## Prototype

```text
Usage: dxn prototype <command> [options]

Project
  workflow            Print the step-by-step guide to building a model; start here
  init                Create a .dxn project in the working directory
  validate            Compile the project and report every error
  status [<node-id>]  Report each required check as passed, failed or missing

Explore
  tree                Print the roots and fragments
  show <node-id> [<context>...]
                      Show a node's states and values in one context
  contexts <node-id> [<filter>...]
                      List every context a node exists in
  views <node-id>     List every distinct view of a node's subtree: one diagram each
  view <node-id> [<context>...]
                      Print the tree present in one view
  axes <node-id>      List what a view or show of a node accepts
  transitions <node-id>
                      List how a shared node's state changes
  evidence <node-id> --actor <name>
                      List every context of a node and the actor's evidence for it

Record
  verify <node-id> --check <c> --result passed|failed --by <who> [<context>...]
                      Record a check's result for a node in one context
  unverify <node-id> --check <c> [<context>...]
                      Remove that record
  attach <node-id> --actor <a> --file <path> --frame <id> [<context>...]
                      Record an actor's evidence for a node in one context
  detach <node-id> --actor <a> --frame <id> [<context>...]
                      Remove that evidence

Model
  node <subcommand>   Add, move, rename and remove nodes; say where they exist
  fragment <subcommand>
                      Add, extract and remove reusable fragments
  type <subcommand>   List and add types and states, and set their values
  state-group <subcommand>
                      List and declare groups of states that exclude each other
  attribute <subcommand>
                      List and declare attributes and their values
  check <subcommand>  List and declare checks that types can require
  dimension <subcommand>
                      List and add dimensions, their values, default and scope
  profile <subcommand>
                      List, add and remove the combinations of values that exist
  modifier <subcommand>
                      List, add and remove accessories that change some profiles' values
  override <subcommand>
                      Change states and values for a dimension value or combination
  expectation <subcommand>
                      List, add and remove the rules the model must follow
  actor <subcommand>  List and declare the roles that do work against the model

  help [<command>]    Show this overview, or a command's usage

To build a model, start with "dxn prototype workflow": it prints the
step-by-step guide as Markdown. Run "dxn prototype help <command>" (or "dxn
prototype <command> --help") for a command's options. The docs/ folder of the
dxn package also explains the concepts, every command, every diagnostic code
and the JSON output.

Options:
  --dir <directory>   Use this project directory instead of the nearest .dxn
  --dry-run           Print the files a command would write, without writing them
  -h, --help          Show this help
  -V, --version       Print version information as JSON
```

Editing commands compile the project with the change applied before they
write anything. If the change would cause an error, they print the
diagnostics and write nothing (exit 1). Files are written atomically and
formatted like Prettier would (two spaces, 80 columns).

Arguments of the form `<name>=<value>` name a context: a dimension
(`breakpoint=sm`), a state group value (`hover=hovered`), the state of a
plain-states type (`state=open`), a shared node's state (`menu=open`), or
a profile (`profile=laptop`). When profiles exist, the dimensions they cover
are filled in from the one profile that fits; when several fit, the command
asks which.

## Prototype: Project

### prototype workflow

```text
Usage: dxn prototype workflow

Prints the step-by-step guide to building a model, from an empty folder to
verified checks, as Markdown. Needs no project.
```

Prints `docs/workflow.md`, which is built into the program, so the guide is there even when the tool ships as one binary with no docs folder.

```bash
dxn prototype workflow
```

### prototype init

```text
Usage: dxn prototype init [--dir <directory>]
```

Creates `.dxn/` (or the `--dir` directory) with a `types.json` that declares nothing yet, and prints `{"created": "<path>"}`. Refuses if the directory exists.

```bash
dxn prototype init
```

### prototype validate

```text
Usage: dxn prototype validate [--dir <directory>]
```

Compiles the project and checks `expectations.json`. Prints each problem to stderr as `<file>:<line>:<column>: <code>: <message>` and then `{"project": "<path>", "errors": <n>}` to stdout. Exits 1 when there are errors. The codes are in [diagnostics.md](diagnostics.md).

```bash
dxn prototype validate
```

### prototype status

```text
Usage: dxn prototype status [<node-id>] [--actor <name>]

Reports every check each typed node requires, in every context it exists in,
as passed, failed or missing. With --actor, reports instead every context of
every node (or of the one named) as present, stale or missing: whether the
actor has evidence for it, and whether its file has changed since.
```

Prints, as JSON, a summary of passed, failed and missing checks, plus one item per required check per context. Pass a node id to cover only that node. With `--actor`, the summary counts present, stale and missing evidence instead, with one item per context of each node: what that actor has not done yet.

```bash
dxn prototype status
dxn prototype status toolbar
dxn prototype status --actor design-agent
```

## Prototype: Explore

### prototype tree

```text
Usage: dxn prototype tree
```

Prints the roots and fragments as JSON, as they are written in the files.

```bash
dxn prototype tree
```

### prototype show

```text
Usage: dxn prototype show <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                                 [--root <root-id>]

Shows the node's states and attribute values in a context. Dimensions
left out take their default; those without one are not applied. Each shared
node above the node needs its state wherever it exists. Without --root, a
fragment's node is shown on its own, without any root's include states.
```

Prints one node in one context as JSON: its states, its state groups, attribute values, and whether it is present. A context argument can be a dimension (`breakpoint=sm`) or a shared node's state (`menu=open`).

```bash
dxn prototype show blog-link
dxn prototype show blog-link pointer=touch
dxn prototype show menu-blog-link breakpoint=base menu=open
```

### prototype contexts

```text
Usage: dxn prototype contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]
                                    [--count | --tree [--by a,b] [--only a,b] [--json] [--transitions]
                                    | --table [--by profile|a,b] [--json]]

Lists every context the node exists in, in each root that contains it.
--subtree lists every part of the node's subtree instead, with the fragment
on its own unless --root names a root. <name>=<value> filters keep only the
contexts with that dimension value, state or shared node state. --count
prints counts instead of the contexts. --tree prints them as a merged tree:
sibling branches with identical subtrees share a line, and dimensions that
change nothing are left out. --by a,b puts those levels first, --only a,b
keeps only those levels, --transitions lists each part's transitions under
it, and --json prints the tree as JSON for tools. --table prints Markdown
tables instead: for a node, one per state group, with a row per profile (or
per combination when there are no profiles) and a column per value; with
--subtree, which nodes exist in which profiles. --by profile or --by a,b
picks the rows, where a and b are dimensions or shared nodes (a row per
state); a cell names the profiles when they differ. --json prints the tables
as JSON.
```

Lists the contexts a node exists in: each one gives a value per dimension, a value per state group (or `state`), and the state of each shared node above it. This is the list of things to design or check. Filters accept dimension values, state group values and shared node states. The tree form is the quickest overview for a person.

```bash
dxn prototype contexts blog-link --count
dxn prototype contexts toolbar --subtree --root article-page pointer=touch hover=hovered --count
dxn prototype contexts wordmark --tree
dxn prototype contexts toolbar --subtree --tree --by breakpoint
dxn prototype contexts menu --tree --transitions
dxn prototype contexts blog-link --table
dxn prototype contexts toolbar --subtree --table --by breakpoint
```

### prototype views

```text
Usage: dxn prototype views <node-id> [<name>=<value>...] [--root <root-id>] [--table]

Lists every distinct view of the node's subtree: each combination of the
dimensions that apply in it, and the states of shared nodes wherever those
nodes are present. Each view is one diagram to draw. <name>=<value> filters
keep only the views with that dimension value, shared node state or profile.
--table prints them as a Markdown table, a row per view.
```

Prints every distinct view of a node's subtree as JSON. Each view is one diagram to draw: a value per dimension, and a state per shared node where it is present.

```bash
dxn prototype views toolbar
dxn prototype views toolbar breakpoint=sm
dxn prototype views toolbar --table
```

### prototype view

```text
Usage: dxn prototype view <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                                [--root <root-id>] [--tree]

Prints the tree present in one view, with each node's states and values.
Dimensions left out take their default; each shared node in the view needs
its state. --tree prints it as indented text instead of JSON.
```

Prints the tree present in one view as JSON, with each node's states and values.

```bash
dxn prototype view toolbar breakpoint=base menu=open
dxn prototype view toolbar profile=phone menu=open --tree
```

### prototype axes

```text
Usage: dxn prototype axes <node-id> [<name>=<value>...] [--root <root-id>]

Lists what view and show accept for the node: the dimensions that apply in
its subtree, with their values and defaults, and the shared nodes above or in
it, with their states and the dimension values where each exists.
<name>=<value> filters describe only the views with that dimension value,
shared node state or profile.
```

Prints what view and show accept for a node, as JSON: the dimensions that apply in its subtree, and the shared nodes with their states and where they exist. Read this first to learn which `<name>=<value>` arguments make sense.

```bash
dxn prototype axes toolbar
dxn prototype axes toolbar profile=phone
```

### prototype transitions

```text
Usage: dxn prototype transitions <node-id>

Lists how a shared node's state changes: each transition's states, DOM event,
target and where focus ends up.
```

Prints a shared node's transitions as JSON.

```bash
dxn prototype transitions menu
```

### prototype evidence

```text
Usage: dxn prototype evidence <node-id> [--actor <name>] [<name>=<value>...] [--root <root-id>]
                                    [--subtree] [--missing] [--table] [--by profile|frame|look]

Lists every context the node exists in, with the profile it matches and the
evidence the actor has recorded for it (--actor may be left out when only one
actor records evidence) in evidence/<root-id>.json: when, the
file and frame it points to, the frame's fingerprint then, and whether what
the frame shows has changed since (stale) or the frame is gone. <name>=<value> filters keep only the contexts with
that dimension value, state, shared node state or profile. --table prints a
Markdown table, a row per context and a column for the actor, where — means no
evidence. Rows come in profile order. --by profile makes a row per profile
instead: the states the node has there, and how many of its contexts have
evidence that is present, stale or missing. --by frame makes a row per frame
the actor pointed to: the contexts it covers, which the design draws as one
look, with when they were recorded and how many are stale. --by look makes a
row per look the model defines, from the node's attributes: the contexts that
look alike, the frames that cover them, and how many still miss evidence. --missing keeps only the contexts
still to cover: those without evidence, or whose evidence is stale.
--subtree covers every node under the one named instead: a row per node, with
its type (— when it has none, so untyped nodes show up), and a column per
profile, each cell the contexts with current evidence out of all, and how
many are stale; with --by frame, a row per frame with the nodes it covers.
```

Prints each context of the node as JSON, with the root, the profile it matches and the actor's evidence for it: `at`, `source`, `fingerprint` and `stale`, plus `gone` when the frame is no longer in the file. A context with no evidence is what is missing. An entry is stale when what its frame shows has changed since it was recorded; that is not an error. `attach` records entries and `detach` removes them; see [concepts.md](concepts.md#actors-and-evidence).

```bash
dxn prototype evidence toolbar --actor design-agent --table
dxn prototype evidence menu --actor design-agent profile=phone
dxn prototype evidence menu-button --actor design-agent --table --by profile
dxn prototype evidence menu-button --actor design-agent --missing --table --by profile
dxn prototype evidence menu-button --actor design-agent --table --by frame
dxn prototype evidence wordmark --by look --table
dxn prototype evidence toolbar --subtree --actor design-agent --missing --table
```

## Prototype: Record

### prototype verify

```text
Usage: dxn prototype verify <node-id> --check <name> --result passed|failed --actor <role>
                                  [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]
                                  [--transition <id>] [--at <time>] [--root <root-id>]

Records a check's result for a node in one context, replacing any earlier
record for the same node, context and check. --actor is the role that checked,
declared in actors.json. The context gives one value for
each of the node's state groups (state=<state> for a plain states list, or
<node-id>=<state> for a shared node, as contexts names it) and the states of
shared nodes above it; dimensions left out take their default.
--transition records the result for one of the node's transitions instead.
--at defaults to now; --root is needed when several roots include the node.
```

Writes a record to `verification/<root-id>.json`. The check must be declared (`check add`) and required by the node's type (`type require`), the actor declared with that check (`actor add --checks`), and the context must be one the node exists in. Every state group needs a value; dimensions left out take their default. The neo-website project declares no checks yet, so the first two lines below set them up.

```bash
dxn prototype check add visual
dxn prototype type require toolbar-link visual
dxn prototype actor add visual-reviewer --checks visual
dxn prototype verify blog-link --check visual --result passed --actor visual-reviewer breakpoint=lg hover=hovered focus=blurred selection=selected
dxn prototype verify menu --check behavior --result passed --actor behavior-reviewer --transition escape
```

### prototype unverify

```text
Usage: dxn prototype unverify <node-id> --check <name> [<group>=<value>...] [<dimension>=<value>...]
                                    [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]

Removes the record for that node and check, in that context or for that
transition.
```

Removes a record written by `verify`.

```bash
dxn prototype unverify blog-link --check visual breakpoint=lg hover=hovered focus=blurred selection=selected
```

### prototype attach

```text
Usage: dxn prototype attach <node-id> [--actor <role>] --file <path> --frame <id>
                                  [<group>=<value>[|<value>]...] [<dimension>=<value>[|<value>]...]
                                  [<shared-node>=<state>[|<state>]...] [profile=<name>[|<name>]]
                                  [--at <time>] [--root <root-id>]

Records evidence that an actor made for a node in one context: a frame in a
file of the repository, such as a design. The context must be complete, as
"dxn prototype evidence" lists it; profile=<name> fills in its dimensions.
Values joined with | record the frame for every combination that is a context
of the node, such as "profile=laptop|desktop" "hover=rest|hovered" for a frame
that shows them all alike; a listed value the node never has is refused. The
frame's fingerprint is recorded, so the entry shows as stale once what the
frame shows changes: for a pen.dev file, the frame and the components and
variables it uses; for any other file, the file. Attaching it again records
the new fingerprint. --file is relative to
the folder that holds .dxn. --at defaults to now; --root is needed when
several roots include the node.
```

Writes an entry to `evidence/<root-id>.json`: the node, its complete context, the actor, when, the file and frame, and the frame's fingerprint: for a pen.dev file, the frame with the components and variables it uses; for any other file, the file. A frame the file does not have is refused. Values joined with `|` record one entry for each combination that is a context of the node, which is how one frame that shows several contexts alike is recorded in one step; a listed value the node never has is refused, and so are lists that match no context. Attaching the same node, context, actor and frame again replaces the entry, which is how a stale entry is renewed after the design changes.

```bash
dxn prototype actor add design-agent --evidence design
dxn prototype attach menu --actor design-agent --file design/website.pen --frame vbGba profile=phone menu=closed
dxn prototype attach wordmark --actor design-agent --file design/website.pen --frame h7eW6z "profile=tablet-landscape|laptop|desktop" "hover=rest|hovered" focus=blurred
```

### prototype detach

```text
Usage: dxn prototype detach <node-id> [--actor <role>] --frame <id>
                                  [<group>=<value>[|<value>]...] [<dimension>=<value>[|<value>]...]
                                  [<shared-node>=<state>[|<state>]...] [profile=<name>[|<name>]]
                                  [--root <root-id>]

Removes the actor's evidence for that node, context and frame; with values
joined with |, for every combination that is a context of the node. --actor
may be left out when only one actor records evidence.
```

Removes the actor's entry for that node, context and frame; with lists, every combination's entry. `--actor` can be left out when only one actor records evidence, here and in `attach` and `evidence`.

```bash
dxn prototype detach menu --actor design-agent --frame vbGba profile=phone menu=closed
```

## Prototype: Model

### prototype node

```text
Usage: dxn prototype node <subcommand>

Subcommands:
  add <id> --title <title> [--parent <id>] [--type <type>]
                                     Add a node; without --parent, a root in roots/<id>.json
  set-title <id> <title>             Change a node's title
  set-type <id> <type> | --none      Change or clear a node's type
  move <id> --parent <id>            Move a node and its subtree under another node
  rename <id> <new-id>               Rename a node and every reference to it
  remove <id>                        Remove a node and its subtree
  only <id> <dimension> (<value>... | --everywhere)
                                     Make a node exist only at some values of a dimension
  only-when <id> <ancestor-id> (<state>... | --always)
                                     Make a node exist only in some states of a shared ancestor
  transition add <node-id> <id> --from <state> --to <state> --on click|input|change|keydown|pointerdown|resize
                 [--key <key>] [--target <node>] [--outside <node>] [--when <dimension>=a,b] [--focus <node>]
                                     Add how a shared node's state changes
  transition remove <node-id> <id>   Remove a transition
  include <parent-id> <fragment-id>  Include a fragment under a node
  include-states <parent-id> <fragment-id> <node-id> <group> (<value>... | --any)
                                     Fix a node's state group values through that include
  uninclude <parent-id> <fragment-id>
                                     Remove that include
  set <id> <attribute> <state>=<value>...
                                     Set the node's own attribute values
  unset <id> <attribute> [<state>...]
                                     Clear some or all of those values
```

Edits nodes in `roots/` and `fragments/`. Renames update every reference: `appliesTo`, `only`, overrides, `onlyWhen`, transitions, include states, verification records and expectations. `node only` and `node only-when` say where a node exists: at some values of a dimension (stored as `only` in `overrides/<dimension>.json`), or in some states of a shared ancestor.

```bash
dxn prototype node add article-page --title "Article page"
dxn prototype node add blog-link --title "Blog link" --parent toolbar-links --type toolbar-link
dxn prototype node include article-page toolbar
dxn prototype node include-states article-page toolbar blog-link selection selected
dxn prototype node only-when menu-panel menu open
dxn prototype node transition add menu escape --from open --to closed --on keydown --key Escape --focus menu-button
dxn prototype node only toolbar-links breakpoint lg xl
dxn prototype node only menu breakpoint base sm
dxn prototype node only menu breakpoint --everywhere
```

### prototype fragment

```text
Usage: dxn prototype fragment <subcommand>

Subcommands:
  add <id> --title <title>           Add a reusable fragment in fragments/<id>.json
  extract <node-id>                  Move a node's subtree into a fragment, included in its place
  remove <id>                        Remove a fragment
```

Edits reusable fragments in `fragments/`.

```bash
dxn prototype fragment add toolbar --title Toolbar
# toolbar was a child of article-page: move it to fragments/toolbar.json
dxn prototype fragment extract toolbar
```

### prototype type

```text
Usage: dxn prototype type <subcommand>

Subcommands:
  list                               List every type, its states, checks and values
  add <name> [--states a,b,c | --groups g,h] [--shared]
                                     Add a type with plain states or state groups;
                                     --shared lets instances' subtrees vary with its state
  use-group <type> <group> [--values a,b]
                                     Use a state group, or only some of its values
  drop-group <type> <group>          Stop using a state group
  share <name> / unshare <name>      Make a type shared, or stop sharing it
  add-state <type> <state>           Add a state to a type
  remove-state <type> <state>        Remove a state from a type
  set <type> <attribute> <state>=<value>...
                                     Set the type's attribute values
  unset <type> <attribute> [<state>...]
                                     Clear some or all of those values
  require <type> <check>             Make every instance of the type need a check
  unrequire <type> <check>           Stop requiring a check
  rename <name> <new-name>           Rename a type and every use of it
  remove <name>                      Remove a type
```

Edits `types` in `types.json`; `type list` prints them.

```bash
dxn prototype type list
dxn prototype type add toolbar-link --groups hover,focus,selection
dxn prototype type add menu --states closed,open --shared
dxn prototype type use-group menu-link selection --values selected
dxn prototype type require toolbar-link visual
```

### prototype state-group

```text
Usage: dxn prototype state-group <subcommand>

A state group is a named set of states that exclude each other, such as hover
(rest, hovered) or selection (unselected, selected). A type can use several
groups, which vary independently. Types use groups with "type add --groups" or
"type use-group".

Subcommands:
  list                               List every state group, its values and the types using it
  add <name> --values a,b            Declare a state group
  add-value <name> <value>           Add a value
  remove-value <name> <value>        Remove a value
  rename-value <name> <old> <new>    Rename a value everywhere the group's types use it
  remove <name>                      Remove a state group
```

Edits `stateGroups` in `types.json`; `state-group list` prints them with the types that use them.

```bash
dxn prototype state-group list
dxn prototype state-group add hover --values rest,hovered
dxn prototype state-group rename-value focus blurred idle
```

### prototype attribute

```text
Usage: dxn prototype attribute <subcommand>

Subcommands:
  list                               List every attribute and its values
  add <name> --values a,b            Declare a attribute and its values
  add-value <name> <value>           Add a value to an attribute
  remove-value <name> <value>        Remove a value from an attribute
  remove <name>                      Remove an attribute
```

Edits `attributes` in `types.json`; `attribute list` prints them. Values are set on types (`type set`), nodes (`node set`) and overrides (`override set`).

```bash
dxn prototype attribute list
dxn prototype attribute add design --values missing,ready
dxn prototype type set toolbar-link design rest=ready hovered=missing
```

### prototype check

```text
Usage: dxn prototype check <subcommand>

Subcommands:
  list                               List every check and the types that require it
  add <name>                         Declare a check, such as visual or behavior
  remove <name>                      Remove a check
```

Edits `checks` in `types.json`; `check list` prints them with the types that require them. Types require checks with `type require`.

```bash
dxn prototype check list
dxn prototype check add visual
```

### prototype dimension

```text
Usage: dxn prototype dimension <subcommand>

Subcommands:
  list                               List every dimension, its values, default and scope
  add <name> --values a,b [--applies-to <id>[,<id>]] [--default <value>]
                                     Add a dimension in dimensions/<name>.json; without
                                     --applies-to it applies to nothing until applied
  add-value <name> <value>           Add a value
  remove-value <name> <value>        Remove a value
  rename-value <name> <old> <new>    Rename a value everywhere it is used
  set-default <name> <value> | --none
                                     Set or clear the default value
  apply <name> <node-id>             Apply the dimension to a node's subtree
  unapply <name> <node-id>           Stop applying it to that node
  remove <name>                      Remove the dimension
```

Edits `dimensions/<name>.json`, and `dimension list` prints every dimension as JSON. Renaming a value updates overrides, `only`, records and expectations.

```bash
dxn prototype dimension list
dxn prototype dimension add breakpoint --values base,sm,lg,xl --applies-to toolbar --default xl
dxn prototype dimension add pointer --values mouse,touch --applies-to toolbar --default mouse
```

### prototype profile

```text
Usage: dxn prototype profile <subcommand>

A profile is a combination of dimension values that exists, such as phone
(breakpoint=base, pointer=touch, keyboard=no-keyboard). Profiles may share a
combination. Once profiles exist, only their combinations do, and commands fill
those dimensions in from the one combination that fits what you give.
Accessories that change some profiles' values are modifiers; see
"dxn prototype modifier".

Subcommands:
  list [--table]                     List every profile and its values
  add <name> <dimension>=<value>... [<name> <dimension>=<value>...]
                                     Add one or more profiles in profiles.json; add
                                     profiles that belong together in one step
  remove <name>                      Remove a profile
```

Edits `profiles.json`: the combinations of dimension values that exist. `profile list` prints them in `profiles.json` order, with a profile for each modifier on each profile it is on, right after that profile, and `sameAs` naming other profiles with the same combination; `--table` prints a Markdown table. Profiles may share a combination. Removing a profile takes it out of every modifier's `on`, and removes a modifier left on none. Add profiles that belong together in one command: once profiles exist only their combinations do, so adding one at a time can break expectations that need the others.

```bash
dxn prototype profile list --table
dxn prototype profile add phone breakpoint=base pointer=touch keyboard=no-keyboard desktop breakpoint=xl pointer=mouse keyboard=keyboard
dxn prototype profile remove tablet-portrait
```

### prototype modifier

```text
Usage: dxn prototype modifier <subcommand>

A modifier is an accessory that changes some of a profile's values, such as a
keyboard with a trackpad on a tablet (pointer=mouse, keyboard=keyboard). It is
on the profiles it names, and makes a profile <profile>+<modifier> for each,
which filters and tables name like any other.

Subcommands:
  list                               List every modifier
  add <name> --on <profile>,... <dimension>=<value>...
                                     Add a modifier in profiles.json
  remove <name>                      Remove a modifier
```

Edits `modifiers` in `profiles.json`: accessories that change some profiles' values. A modifier is on the profiles it names, sets only dimensions the profiles give, and must change something on each. Each makes a profile `<profile>+<modifier>`.

```bash
dxn prototype modifier add magic-keyboard --on tablet-portrait,tablet-landscape pointer=mouse keyboard=keyboard
dxn prototype modifier list
dxn prototype modifier remove magic-keyboard
```

### prototype override

```text
Usage: dxn prototype override <subcommand>

<context> is <dimension>=<value>, or several joined by commas for a
combination, e.g. breakpoint=sm,pointer=touch; or a shared node's state,
e.g. form=incomplete, which changes the nodes below that shared node.
Separate several values with | to write the same override at each, e.g.
"form=empty|email-filled" (quote it in a shell).

Subcommands:
  states <context> (--type <t> | --node <id>) [--add <state>]... [--remove <state>]...
                                     Add or remove states in that context
  set <context> (--type <t> | --node <id>) <attribute> <state>=<value>...
                                     Set attribute values in that context
  unset <context> (--type <t> | --node <id>) [<attribute> [<state>...]]
                                     Clear some values, an attribute, or the whole override
```

Edits `overrides/<dimension>.json`, or `overrides/<a>+<b>.json` for a combination.

```bash
dxn prototype override states pointer=touch --type toolbar-link --remove hovered
dxn prototype override states breakpoint=sm,pointer=touch --node menu-button --remove focused
dxn prototype override set keyboard=no-keyboard --type toolbar-link design rest=missing
```

### prototype expectation

```text
Usage: dxn prototype expectation <subcommand>

An expectation is a rule the model must follow, in expectations.json. The
compiler checks every rule on every command, so adding one that fails, or that
tests nothing, is refused.

Subcommands:
  list                               List every rule
  add <title> --node <id> [--subtree] [--root <id>] [--when <name>=<value>[|<value>]]...
      (--then <name>=<value>[|<value>]... | --some <name>=<value>... | --exists | --absent)
      [--attribute <name>=<value>[|<value>]]...
      [--on <event> [--key <key>] [--target <id>] [--outside <id>] [--reach <dimension>=<value>]...]
                                     Add a rule. --then: every kept context has these
                                     values; --some: at least one does; --exists or
                                     --absent: the node is there wherever --when holds,
                                     or nowhere. --attribute checks attribute values
                                     with --then or --some. --on makes a transition rule:
                                     its --when names the state before, its --then the
                                     state after and focus.
  remove <title>                     Remove a rule
```

Edits `expectations.json`: the rules the model must follow. Each rule is compiled like any other edit, so one that fails, or that tests nothing, is refused.

```bash
dxn prototype expectation add "Touch never hovers" --node toolbar --subtree --when pointer=touch --then hover=rest
dxn prototype expectation add "The panel is only there while open" --node menu-panel --when menu=closed --absent
dxn prototype expectation list
dxn prototype expectation remove "Touch never hovers"
```

### prototype actor

```text
Usage: dxn prototype actor <subcommand>

An actor is a role that does work against the model, declared in actors.json
with what it records: evidence of one kind, such as a design agent's designs,
and the checks whose results it may record, such as a visual reviewer's.
--source says what its evidence must be: frames in a pen.dev file
(pen.dev), fingerprinted by what each frame shows, or any file (file),
fingerprinted as a whole.

Subcommands:
  list                               List every actor and what it records
  add <name> [--evidence <kind>] [--source pen.dev|file] [--checks <check>,...]
                                     Declare an actor, such as design-agent
  set <name> [--evidence <kind>] [--source pen.dev|file] [--checks <check>,...]
                                     Change what an actor records
  remove <name>                      Remove an actor that no evidence or record names
```

Edits `actors.json`: the roles that do work against the model. An actor is a role, not a person: `design-agent`, not someone's name. `actor list` prints them; `evidence` queries what an actor has recorded.

```bash
dxn prototype actor add design-agent --evidence design --source pen.dev
dxn prototype actor add visual-reviewer --checks visual
dxn prototype actor set design-agent --checks visual
dxn prototype actor list
```
