# Commands

Every command is `dimensions <command> ...`. The usage blocks below are the
same text that `dimensions help <command>` and `dimensions <command> --help`
print, and a test keeps them in sync. For the ideas behind the commands, see
[concepts.md](concepts.md). For what they print, see [output.md](output.md).

## Global options

- `--dir <directory>` uses that project directory instead of the nearest
  `.dimensions` in the working directory or above.
- `--dry-run` makes an editing command print the files it would write, as
  JSON, without writing them.
- `-h`, `--help` print the overview, or a command's usage when they come
  after a command. Neither needs a project.
- `-V`, `--version` print `{"version": "<version>"}`.

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

## Contents

- Project: [init](#init), [validate](#validate), [status](#status)
- Explore: [tree](#tree), [show](#show), [contexts](#contexts), [views](#views), [view](#view), [axes](#axes), [transitions](#transitions)
- Record: [verify](#verify), [unverify](#unverify)
- Model: [node](#node), [fragment](#fragment), [type](#type), [state-group](#state-group), [attribute](#attribute), [check](#check), [dimension](#dimension), [profile](#profile), [override](#override)

## Project

### init

```text
Usage: dimensions init [--dir <directory>]
```

Creates `.dimensions/` (or the `--dir` directory) with a `types.json` that declares nothing yet, and prints `{"created": "<path>"}`. Refuses if the directory exists.

```bash
dimensions init
```

### validate

```text
Usage: dimensions validate [--dir <directory>]
```

Compiles the project and checks `expectations.json`. Prints each problem to stderr as `<file>:<line>:<column>: <code>: <message>` and then `{"project": "<path>", "errors": <n>}` to stdout. Exits 1 when there are errors. The codes are in [diagnostics.md](diagnostics.md).

```bash
dimensions validate
```

### status

```text
Usage: dimensions status [<node-id>]

Reports every check each typed node requires, in every context it exists in,
as passed, failed or missing.
```

Prints, as JSON, a summary of passed, failed and missing checks, plus one item per required check per context. Pass a node id to cover only its subtree.

```bash
dimensions status
dimensions status toolbar
```

## Explore

### tree

```text
Usage: dimensions tree
```

Prints the roots and fragments as JSON, as they are written in the files.

```bash
dimensions tree
```

### show

```text
Usage: dimensions show <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                       [--root <root-id>]

Shows the node's states and attribute values in a context. Dimensions
left out take their default; those without one are not applied. Each shared
node above the node needs its state wherever it exists. Without --root, a
fragment's node is shown on its own, without any root's include states.
```

Prints one node in one context as JSON: its states, its state groups, attribute values, and whether it is present. A context argument can be a dimension (`breakpoint=sm`) or a shared node's state (`menu=open`).

```bash
dimensions show blog-link
dimensions show blog-link pointer=touch
dimensions show menu-blog-link breakpoint=base menu=open
```

### contexts

```text
Usage: dimensions contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]
                          [--count | --tree [--by a,b] [--only a,b] [--json] [--transitions]]

Lists every context the node exists in, in each root that contains it.
--subtree lists every part of the node's subtree instead, with the fragment
on its own unless --root names a root. <name>=<value> filters keep only the
contexts with that dimension value, state or shared node state. --count
prints counts instead of the contexts. --tree prints them as a merged tree:
sibling branches with identical subtrees share a line, and dimensions that
change nothing are left out. --by a,b puts those levels first, --only a,b
keeps only those levels, --transitions lists each part's transitions under
it, and --json prints the tree as JSON for tools.
```

Lists the contexts a node exists in: each one gives a value per dimension, a value per state group (or `state`), and the state of each shared node above it. This is the list of things to design or check. Filters accept dimension values, state group values and shared node states. The tree form is the quickest overview for a person.

```bash
dimensions contexts blog-link --count
dimensions contexts toolbar --subtree --root article-page pointer=touch hover=hovered --count
dimensions contexts wordmark --tree
dimensions contexts toolbar --subtree --tree --by breakpoint
dimensions contexts menu --tree --transitions
```

### views

```text
Usage: dimensions views <node-id> [--root <root-id>]

Lists every distinct view of the node's subtree: each combination of the
dimensions that apply in it, and the states of shared nodes wherever those
nodes are present. Each view is one diagram to draw.
```

Prints every distinct view of a node's subtree as JSON. Each view is one diagram to draw: a value per dimension, and a state per shared node where it is present.

```bash
dimensions views toolbar
```

### view

```text
Usage: dimensions view <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                      [--root <root-id>]

Prints the tree present in one view, with each node's states and values.
Dimensions left out take their default; each shared node in the view needs
its state.
```

Prints the tree present in one view as JSON, with each node's states and values.

```bash
dimensions view toolbar breakpoint=base menu=open
```

### axes

```text
Usage: dimensions axes <node-id> [--root <root-id>]

Lists what view and show accept for the node: the dimensions that apply in
its subtree, with their values and defaults, and the shared nodes above or in
it, with their states and the dimension values where each exists.
```

Prints what view and show accept for a node, as JSON: the dimensions that apply in its subtree, and the shared nodes with their states and where they exist. Read this first to learn which `<name>=<value>` arguments make sense.

```bash
dimensions axes toolbar
```

### transitions

```text
Usage: dimensions transitions <node-id>

Lists how a shared node's state changes: each transition's states, DOM event,
target and where focus ends up.
```

Prints a shared node's transitions as JSON.

```bash
dimensions transitions menu
```

## Record

### verify

```text
Usage: dimensions verify <node-id> --check <name> --result passed|failed --by <who>
                        [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]
                        [--transition <id>] [--evidence <path>] [--at <time>] [--root <root-id>]

Records a check's result for a node in one context, replacing any earlier
record for the same node, context and check. The context gives one value for
each of the node's state groups (state=<state> for a plain states list, or
<node-id>=<state> for a shared node, as contexts names it) and the states of
shared nodes above it; dimensions left out take their default.
--transition records the result for one of the node's transitions instead.
--at defaults to now; --root is needed when several roots include the node.
```

Writes a record to `verification/<root-id>.json`. The check must be declared (`check add`) and required by the node's type (`type require`), and the context must be one the node exists in. Every state group needs a value; dimensions left out take their default. The neo-website project declares no checks yet, so the first two lines below set them up.

```bash
dimensions check add visual
dimensions type require toolbar-link visual
dimensions verify blog-link --check visual --result passed --by pen.dev breakpoint=lg hover=hovered focus=blurred selection=selected
dimensions verify menu --check behavior --result passed --by agent --transition escape
```

### unverify

```text
Usage: dimensions unverify <node-id> --check <name> [<group>=<value>...] [<dimension>=<value>...]
                          [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]

Removes the record for that node and check, in that context or for that
transition.
```

Removes a record written by `verify`.

```bash
dimensions unverify blog-link --check visual breakpoint=lg hover=hovered focus=blurred selection=selected
```

## Model

### node

```text
Usage: dimensions node <subcommand>

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
  transition add <node-id> <id> --from <state> --to <state> --on click|keydown|pointerdown|resize
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
dimensions node add article-page --title "Article page"
dimensions node add blog-link --title "Blog link" --parent toolbar-links --type toolbar-link
dimensions node include article-page toolbar
dimensions node include-states article-page toolbar blog-link selection selected
dimensions node only-when menu-panel menu open
dimensions node transition add menu escape --from open --to closed --on keydown --key Escape --focus menu-button
dimensions node only toolbar-links breakpoint lg xl
dimensions node only menu breakpoint base sm
dimensions node only menu breakpoint --everywhere
```

### fragment

```text
Usage: dimensions fragment <subcommand>

Subcommands:
  add <id> --title <title>           Add a reusable fragment in fragments/<id>.json
  extract <node-id>                  Move a node's subtree into a fragment, included in its place
  remove <id>                        Remove a fragment
```

Edits reusable fragments in `fragments/`.

```bash
dimensions fragment add toolbar --title Toolbar
# toolbar was a child of article-page: move it to fragments/toolbar.json
dimensions fragment extract toolbar
```

### type

```text
Usage: dimensions type <subcommand>

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
dimensions type list
dimensions type add toolbar-link --groups hover,focus,selection
dimensions type add menu --states closed,open --shared
dimensions type use-group menu-link selection --values selected
dimensions type require toolbar-link visual
```

### state-group

```text
Usage: dimensions state-group <subcommand>

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
dimensions state-group list
dimensions state-group add hover --values rest,hovered
dimensions state-group rename-value focus blurred idle
```

### attribute

```text
Usage: dimensions attribute <subcommand>

Subcommands:
  list                               List every attribute and its values
  add <name> --values a,b            Declare a attribute and its values
  add-value <name> <value>           Add a value to an attribute
  remove-value <name> <value>        Remove a value from an attribute
  remove <name>                      Remove an attribute
```

Edits `attributes` in `types.json`; `attribute list` prints them. Values are set on types (`type set`), nodes (`node set`) and overrides (`override set`).

```bash
dimensions attribute list
dimensions attribute add design --values missing,ready
dimensions type set toolbar-link design rest=ready hovered=missing
```

### check

```text
Usage: dimensions check <subcommand>

Subcommands:
  list                               List every check and the types that require it
  add <name>                         Declare a check, such as visual or behavior
  remove <name>                      Remove a check
```

Edits `checks` in `types.json`; `check list` prints them with the types that require them. Types require checks with `type require`.

```bash
dimensions check list
dimensions check add visual
```

### dimension

```text
Usage: dimensions dimension <subcommand>

Subcommands:
  list                               List every dimension, its values, default and scope
  add <name> --values a,b --applies-to <id>[,<id>] [--default <value>]
                                     Add a dimension in dimensions/<name>.json
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
dimensions dimension list
dimensions dimension add breakpoint --values base,sm,lg,xl --applies-to toolbar --default xl
dimensions dimension add pointer --values mouse,touch --applies-to toolbar --default mouse
```

### profile

```text
Usage: dimensions profile <subcommand>

A profile is a combination of dimension values that exists, such as phone
(breakpoint=base, pointer=touch, keyboard=no-keyboard). Once profiles exist,
only their combinations do, and commands fill those dimensions in from the one
profile that fits what you give.

Subcommands:
  list                               List every profile and its values
  add <name> <dimension>=<value>...  Add a profile in profiles.json
  remove <name>                      Remove a profile
```

Edits `profiles.json`: the combinations of dimension values that exist. `profile list` prints them. Adding a profile that repeats another one's combination is refused.

```bash
dimensions profile list
dimensions profile add tablet-portrait breakpoint=sm pointer=touch keyboard=no-keyboard
dimensions profile remove tablet-portrait
```

### override

```text
Usage: dimensions override <subcommand>

<context> is <dimension>=<value>, or several joined by commas for a
combination, e.g. breakpoint=sm,pointer=touch.

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
dimensions override states pointer=touch --type toolbar-link --remove hovered
dimensions override states breakpoint=sm,pointer=touch --node menu-button --remove focused
dimensions override set keyboard=no-keyboard --type toolbar-link design rest=missing
```
