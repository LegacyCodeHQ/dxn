# Commands

Every command is `task-tree <command> ...`. The usage blocks below are the
same text that `task-tree help <command>` and `task-tree <command> --help`
print, and a test keeps them in sync. For the ideas behind the commands, see
[concepts.md](concepts.md). For what they print, see [output.md](output.md).

## Global options

- `--dir <directory>` uses that project directory instead of the nearest
  `.task-tree` in the working directory or above.
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
plain-states type (`state=open`), or a shared node's state (`menu=open`).

## Contents

- Setup and checking: [init](#init), [validate](#validate)
- Reading: [tree](#tree), [dimensions](#dimensions), [query](#query), [contexts](#contexts), [axes](#axes), [views](#views), [view](#view), [transitions](#transitions), [status](#status)
- Verifying: [verify](#verify), [unverify](#unverify)
- Editing the tree: [node](#node), [component](#component)
- Editing types and states: [type](#type), [state-group](#state-group), [attribute](#attribute), [check](#check)
- Editing dimensions: [dimension](#dimension), [only](#only), [override](#override)

## Setup and checking

### init

```text
Usage: task-tree init [--dir <directory>]
```

Creates `.task-tree/` (or the `--dir` directory) with a `types.json` that declares nothing yet, and prints `{"created": "<path>"}`. Refuses if the directory exists.

```bash
task-tree init
```

### validate

```text
Usage: task-tree validate [--dir <directory>]
```

Compiles the project and checks `expectations.json`. Prints each problem to stderr as `<file>:<line>:<column>: <code>: <message>` and then `{"project": "<path>", "errors": <n>}` to stdout. Exits 1 when there are errors. The codes are in [diagnostics.md](diagnostics.md).

```bash
task-tree validate
```

## Reading

### tree

```text
Usage: task-tree tree
```

Prints the roots and components as JSON, as they are written in the files.

```bash
task-tree tree
```

### dimensions

```text
Usage: task-tree dimensions

Lists every dimension: its values, default, and the nodes it applies to.
```

Prints every dimension as JSON.

```bash
task-tree dimensions
```

### query

```text
Usage: task-tree query <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]

Shows the node's states and custom attribute values in a context. Dimensions
left out take their default; those without one are not applied.
```

Prints one node in one context as JSON: its states, its state groups, custom attribute values, and whether it is present. A context argument can be a dimension (`breakpoint=sm`) or a shared node's state (`menu=open`).

```bash
task-tree query blog-link
task-tree query blog-link pointer=touch
task-tree query menu-blog-link breakpoint=base menu=open
```

### contexts

```text
Usage: task-tree contexts <node-id> [<name>=<value>...] [--subtree] [--root <root-id>]
                         [--count | --tree [--by a,b] [--only a,b] [--json] [--transitions]]

Lists every context the node exists in, in each root that contains it.
--subtree lists every part of the node's subtree instead, with the component
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
task-tree contexts blog-link --count
task-tree contexts toolbar --subtree --root article-page pointer=touch hover=hovered --count
task-tree contexts wordmark --tree
task-tree contexts toolbar --subtree --tree --by breakpoint
task-tree contexts menu --tree --transitions
```

### axes

```text
Usage: task-tree axes <node-id> [--root <root-id>]

Lists what a view or query of the node accepts: the dimensions that apply in
its subtree, with their values and defaults, and the shared nodes above or in
it, with their states and the dimension values where each exists.
```

Prints what a view or query of a node accepts, as JSON: the dimensions that apply in its subtree, and the shared nodes with their states and where they exist. Read this first to learn which `<name>=<value>` arguments make sense.

```bash
task-tree axes toolbar
```

### views

```text
Usage: task-tree views <node-id> [--root <root-id>]

Lists every distinct view of the node's subtree: each combination of the
dimensions that apply in it, and the states of shared nodes wherever those
nodes are present. Each view is one diagram to draw.
```

Prints every distinct view of a node's subtree as JSON. Each view is one diagram to draw: a value per dimension, and a state per shared node where it is present.

```bash
task-tree views toolbar
```

### view

```text
Usage: task-tree view <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
                     [--root <root-id>]

Prints the tree present in one view, with each node's states and values.
Dimensions left out take their default; each shared node in the view needs
its state.
```

Prints the tree present in one view as JSON, with each node's states and values.

```bash
task-tree view toolbar breakpoint=base menu=open
```

### transitions

```text
Usage: task-tree transitions <node-id>

Lists how a shared node's state changes: each transition's states, DOM event,
target and where focus ends up.
```

Prints a shared node's transitions as JSON.

```bash
task-tree transitions menu
```

### status

```text
Usage: task-tree status [<node-id>]

Reports every check each typed node requires, in every context it exists in,
as passed, failed or missing.
```

Prints, as JSON, a summary of passed, failed and missing checks, plus one item per required check per context. Pass a node id to cover only its subtree.

```bash
task-tree status
task-tree status toolbar
```

## Verifying

### verify

```text
Usage: task-tree verify <node-id> --check <name> --result passed|failed --by <who>
                       [<group>=<value>...] [<dimension>=<value>...] [<shared-node>=<state>...]
                       [--transition <id>] [--evidence <path>] [--at <time>] [--root <root-id>]

Records a check's result for a node in one context, replacing any earlier
record for the same node, context and check. The context gives one value for
each of the node's state groups (state=<state> for a plain states list) and
the states of shared nodes above it; dimensions left out take their default.
--transition records the result for one of the node's transitions instead.
--at defaults to now; --root is needed when several roots include the node.
```

Writes a record to `verification/<root-id>.json`. The node's type must require the check (`type require`), and the context must be one the node exists in.

```bash
task-tree verify blog-link --check visual --result passed --by pen.dev breakpoint=lg hover=hovered focus=blurred selection=selected
task-tree verify menu --check behavior --result passed --by agent --transition escape
```

### unverify

```text
Usage: task-tree unverify <node-id> --check <name> [<group>=<value>...] [<dimension>=<value>...]
                         [<shared-node>=<state>...] [--transition <id>] [--root <root-id>]

Removes the record for that node and check, in that context or for that
transition.
```

Removes a record written by `verify`.

```bash
task-tree unverify blog-link --check visual breakpoint=lg hover=hovered focus=blurred selection=selected
```

## Editing the tree

### node

```text
Usage: task-tree node <subcommand>

Subcommands:
  add <id> --title <title> [--parent <id>] [--type <type>]
                                     Add a node; without --parent, a root in roots/<id>.json
  set-title <id> <title>             Change a node's title
  set-type <id> <type> | --none      Change or clear a node's type
  move <id> --parent <id>            Move a node and its subtree under another node
  rename <id> <new-id>               Rename a node and every reference to it
  remove <id>                        Remove a node and its subtree
  only-when <id> <ancestor-id> (<state>... | --always)
                                     Make a node exist only in some states of a shared ancestor
  transition add <node-id> <id> --from <state> --to <state> --on click|keydown|pointerdown|resize
                 [--key <key>] [--target <node>] [--outside <node>] [--when <dimension>=a,b] [--focus <node>]
                                     Add how a shared node's state changes
  transition remove <node-id> <id>   Remove a transition
  include <parent-id> <component-id> Include a component under a node
  include-states <parent-id> <component-id> <node-id> <group> (<value>... | --any)
                                     Fix a node's state group values through that include
  uninclude <parent-id> <component-id>
                                     Remove that include
  set <id> <attribute> <state>=<value>...
                                     Set the node's own custom attribute values
  unset <id> <attribute> [<state>...]
                                     Clear some or all of those values
```

Edits nodes in `roots/` and `components/`. Renames and removals update every reference: overrides, `only`, `appliesTo`, `onlyWhen`, transitions, include states and verification records.

```bash
task-tree node add article-page --title "Article page"
task-tree node add blog-link --title "Blog link" --parent toolbar-links --type toolbar-link
task-tree node include article-page toolbar
task-tree node include-states article-page toolbar blog-link selection selected
task-tree node only-when menu-panel menu open
task-tree node transition add menu escape --from open --to closed --on keydown --key Escape --focus menu-button
```

### component

```text
Usage: task-tree component <subcommand>

Subcommands:
  add <id> --title <title>           Add a reusable component in components/<id>.json
  extract <node-id>                  Move a node's subtree into a component, included in its place
  remove <id>                        Remove a component
```

Edits reusable components in `components/`.

```bash
task-tree component add toolbar --title Toolbar
# toolbar was a child of article-page: move it to components/toolbar.json
task-tree component extract toolbar
```

## Editing types and states

### type

```text
Usage: task-tree type <subcommand>

Subcommands:
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
                                     Set the type's custom attribute values
  unset <type> <attribute> [<state>...]
                                     Clear some or all of those values
  require <type> <check>             Make every instance of the type need a check
  unrequire <type> <check>           Stop requiring a check
  rename <name> <new-name>           Rename a type and every use of it
  remove <name>                      Remove a type
```

Edits `types` in `types.json`.

```bash
task-tree type add toolbar-link --groups hover,focus,selection
task-tree type add menu --states closed,open --shared
task-tree type use-group menu-link selection --values selected
task-tree type require toolbar-link visual
```

### state-group

```text
Usage: task-tree state-group <subcommand>

A state group is a named set of states that exclude each other, such as hover
(rest, hovered) or selection (unselected, selected). A type can use several
groups, which vary independently. Types use groups with "type add --groups" or
"type use-group".

Subcommands:
  add <name> --values a,b            Declare a state group
  add-value <name> <value>           Add a value
  remove-value <name> <value>        Remove a value
  rename-value <name> <old> <new>    Rename a value everywhere the group's types use it
  remove <name>                      Remove a state group
```

Edits `stateGroups` in `types.json`.

```bash
task-tree state-group add hover --values rest,hovered
task-tree state-group rename-value focus blurred idle
```

### attribute

```text
Usage: task-tree attribute <subcommand>

Subcommands:
  add <name> --values a,b            Declare a custom attribute and its values
  add-value <name> <value>           Add a value to an attribute
  remove-value <name> <value>        Remove a value from an attribute
  remove <name>                      Remove an attribute
```

Edits `customAttributes` in `types.json`. Values are set on types (`type set`), nodes (`node set`) and overrides (`override set`).

```bash
task-tree attribute add design --values missing,ready
task-tree type set toolbar-link design rest=ready hovered=missing
```

### check

```text
Usage: task-tree check <subcommand>

Subcommands:
  add <name>                         Declare a check, such as visual or behavior
  remove <name>                      Remove a check
```

Edits `customChecks` in `types.json`. Types require checks with `type require`.

```bash
task-tree check add visual
```

## Editing dimensions

### dimension

```text
Usage: task-tree dimension <subcommand>

Subcommands:
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

Edits `dimensions/<name>.json`. Renaming a value updates overrides, `only`, records and expectations.

```bash
task-tree dimension add breakpoint --values base,sm,lg,xl --applies-to toolbar --default xl
task-tree dimension add pointer --values mouse,touch --applies-to toolbar --default mouse
```

### only

```text
Usage: task-tree only <dimension> <node-id> (<value>... | --everywhere)

Says where a node and its subtree exist: only at the given values of the
dimension, or everywhere again with --everywhere.
```

Edits `only` in `overrides/<dimension>.json`.

```bash
task-tree only breakpoint toolbar-links lg xl
task-tree only breakpoint menu base sm
task-tree only breakpoint menu --everywhere
```

### override

```text
Usage: task-tree override <subcommand>

<context> is <dimension>=<value>, or several joined by commas for a
combination, e.g. breakpoint=sm,pointer=touch.

Subcommands:
  states <context> (--type <t> | --node <id>) [--add <state>]... [--remove <state>]...
                                     Add or remove states in that context
  set <context> (--type <t> | --node <id>) <attribute> <state>=<value>...
                                     Set custom attribute values in that context
  unset <context> (--type <t> | --node <id>) [<attribute> [<state>...]]
                                     Clear some values, an attribute, or the whole override
```

Edits `overrides/<dimension>.json`, or `overrides/<a>+<b>.json` for a combination.

```bash
task-tree override states pointer=touch --type toolbar-link --remove hovered
task-tree override states breakpoint=sm,pointer=touch --node menu-button --remove focused
task-tree override set keyboard=no-keyboard --type toolbar-link design rest=missing
```
