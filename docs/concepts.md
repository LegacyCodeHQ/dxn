# Concepts

dimensions models work as a tree of **nodes**, says which **states** each node
can be in and under which **dimensions** (breakpoint, pointer, …), and records
whether each resulting combination has been checked. Everything lives in JSON
files in a `.dimensions/` folder. The CLI edits them safely and answers
questions about them.

The running example is the toolbar of a blog (the `neo-website` project). It
has a wordmark, a blog link shown on wide screens, and a menu button that
opens a panel with the same link on narrow screens.

- [The project folder](#the-project-folder)
- [Nodes, roots and components](#nodes-roots-and-components)
- [Types and states](#types-and-states)
- [State groups](#state-groups)
- [Dimensions and contexts](#dimensions-and-contexts)
- [Presence: only](#presence-only)
- [Overrides](#overrides)
- [Shared states and onlyWhen](#shared-states-and-onlywhen)
- [Transitions](#transitions)
- [Includes and include states](#includes-and-include-states)
- [Custom attributes](#custom-attributes)
- [Checks and verification](#checks-and-verification)
- [Expectations](#expectations)
- [Views and axes](#views-and-axes)

## The project folder

```
.dimensions/
  types.json                  state groups, attributes, checks and types
  roots/<root-id>.json        one root per file
  components/<id>.json        one reusable component per file
  dimensions/<name>.json      one dimension per file
  overrides/<name>.json       presence and overrides for one dimension
  overrides/<a>+<b>.json      overrides for combinations of dimensions
  verification/<root-id>.json check results for nodes in that root
  expectations.json           counts the model must produce
```

`dimensions init` creates the folder. Commands find the nearest `.dimensions`
in the working directory or above, or the one `--dir` names. Every file has
`"version": 1`, and every file has a JSON schema in `schema/`.

`dimensions validate` compiles the whole folder and reports every error with
its file, line and column. There are no warnings: a project either compiles
or it doesn't. Every editing command compiles the result before it writes
anything, so a command can't leave the project broken. See
[diagnostics.md](diagnostics.md).

## Nodes, roots and components

A **node** is anything to be built and checked: a page, a toolbar, a link.
It has an `id` (unique across the project), a `title`, and optionally a
`type` and `children`. A node is not necessarily a UI component. "Links" is a
node that only groups the blog link.

A **root** is a node with no parent, in `roots/<id>.json`. It is the thing
being delivered, such as a page, an endpoint or a job. It is also where
contexts are counted from and where verification records are filed. A
**component** is a reusable node tree in `components/<id>.json` that roots
(or other components) **include**:

```json
{
  "version": 1,
  "component": {
    "id": "toolbar",
    "title": "Toolbar",
    "children": [
      { "id": "wordmark", "title": "Wordmark", "type": "wordmark" },
      {
        "id": "toolbar-links",
        "title": "Links",
        "children": [{ "id": "blog-link", "title": "Blog link", "type": "toolbar-link" }]
      },
      { "id": "menu", "title": "Menu", "type": "menu", "children": ["…"] }
    ]
  }
}
```

```json
{
  "version": 1,
  "root": { "id": "article-page", "title": "Article page", "children": [{ "include": "toolbar" }] }
}
```

`dimensions tree` prints the roots and the components.

## Types and states

A **type** says which states its nodes have. It is declared once in
`types.json`, and every node with that type gets them. A type's states are
either a plain list:

```json
"menu": { "states": ["closed", "open"], "shared": true }
```

or a set of state groups (next section). A node without a type has no states.

`dimensions show blog-link` shows a node's states in one context.

## State groups

A **state group** is a named set of states that exclude each other, such as
`hover` (`rest` or `hovered`). Groups are independent of one another, so a
link with `hover`, `focus` and `selection` can be hovered and focused at once.
Every combination of one value per group is a separate thing to check.

```json
"stateGroups": {
  "selection": ["unselected", "selected"],
  "hover": ["rest", "hovered"],
  "focus": ["blurred", "focused"]
},
"types": {
  "toolbar-link": { "stateGroups": ["hover", "focus", "selection"] },
  "wordmark": { "stateGroups": ["hover", "focus"] }
}
```

A type can also use only some values of a group:
`"stateGroups": { "selection": ["selected"] }`. A type's groups can't share a
value name, and `state` is reserved (it is the key for a plain states list).

## Dimensions and contexts

A **dimension** is something outside the node that changes what it looks like
or does, such as screen width or input device. Each dimension has its own file:

```json
// dimensions/breakpoint.json
{ "version": 1, "values": ["base", "sm", "lg", "xl"], "default": "xl",
  "appliesTo": ["toolbar"] }
```

- `values` are the dimension's values, in order.
- `appliesTo` lists nodes. The dimension applies to each one and to its whole
  subtree, wherever it is included.
- `default` is the value `show`, `view` and `verify` use when you leave the
  dimension out. Without a default, leaving it out doesn't apply it.

The toolbar has three dimensions: `breakpoint` (base, sm, lg, xl), `pointer`
(mouse, touch) and `keyboard` (keyboard, no-keyboard).

A **context** is one value for every dimension that applies to a node, one
value for each of its state groups (or its one plain state), and the state of
every shared node above it. `dimensions contexts blog-link` lists all of
them, `--count` counts them, and `--tree` draws them as a merged tree.
`dimensions dimension list` lists every dimension.

## Presence: only

Some nodes exist only at some values of a dimension. The blog link is only on
wide screens, and the menu only on narrow ones. `only` in
`overrides/<dimension>.json` says so, for the node and its whole subtree:

```json
// overrides/breakpoint.json
{ "version": 1,
  "only": { "toolbar-links": ["lg", "xl"], "menu": ["base", "sm"] },
  "overrides": {} }
```

A node left out of `only` exists at every value. `show` reports
`"present": false` where a node doesn't exist, and `contexts` skips those
contexts. Set it with `dimensions node only menu breakpoint base sm`.

## Overrides

An **override** changes a type's or a node's states (or custom attribute
values) at one value of a dimension. On a touch screen nothing can be
hovered:

```json
// overrides/pointer.json
{ "version": 1, "overrides": {
  "touch": { "types": {
    "toolbar-link": { "states": { "remove": ["hovered"] } },
    "wordmark":     { "states": { "remove": ["hovered"] } } } } } }
```

`types` overrides every node of that type, and `nodes` overrides one node by
id. Either one can `add` states as well as `remove` them. A node can only be
overridden by a dimension that applies to it.

A **combination override** applies only where several dimensions take given
values together. It lives in `overrides/<a>+<b>.json`, with dimension names in
alphabetical order, nested in that order:

```json
// overrides/breakpoint+pointer.json
{ "version": 1, "overrides": { "sm": { "touch": { "nodes": { "…": {} } } } } }
```

**Precedence**, weakest first:

1. the type's own states and values
2. type overrides for one dimension
3. type overrides for combinations, fewer dimensions first
4. the node's own values
5. node overrides for one dimension
6. node overrides for combinations, fewer dimensions first

Two overrides at the same level that disagree in a context they share are a
`conflicting-override` error. To settle it, add a combination override for
those values, which outranks both.

Set overrides with `dimensions override states pointer=touch --type
toolbar-link --remove hovered`. For a combination, write
`breakpoint=sm,pointer=touch`.

## Shared states and onlyWhen

Some states change what exists below a node, not just how the node looks.
When the menu is open, its panel exists, and when it is closed, it doesn't. A
type marked `"shared": true` says that its instances' state shapes their
subtree. Descendants then say in which of those states they exist with
`onlyWhen`:

```json
{
  "id": "menu",
  "title": "Menu",
  "type": "menu",
  "children": [
    { "id": "menu-button", "title": "Menu button", "type": "menu-button" },
    {
      "id": "menu-panel",
      "title": "Menu panel",
      "onlyWhen": { "menu": ["open"] },
      "children": [{ "id": "menu-blog-link", "title": "Menu blog link", "type": "menu-link" }]
    }
  ]
}
```

A shared type uses plain states or a single state group, and the state is
named by the node's id (`menu=open`). The ancestor in `onlyWhen` must be in
the same file. Every context of a node below `menu` includes the menu's
state, so filters like `contexts toolbar --subtree menu=open` work.

## Transitions

A shared node can list how its state changes, as DOM events:

```json
"transitions": [
  { "id": "open", "from": "closed", "to": "open", "on": "click", "target": "menu-button" },
  { "id": "escape", "from": "open", "to": "closed", "on": "keydown", "key": "Escape",
    "focus": "menu-button" },
  { "id": "outside", "from": "open", "to": "closed", "on": "pointerdown", "outside": "toolbar" },
  { "id": "widen", "from": "open", "to": "closed", "on": "resize",
    "when": { "breakpoint": ["lg", "xl"] }, "focus": "blog-link" }
]
```

| `on`          | needs                                   |
| ------------- | --------------------------------------- |
| `click`       | `target`: the node clicked              |
| `keydown`     | `key`, as `KeyboardEvent.key` names it  |
| `pointerdown` | `target`, or `outside`: a node          |
| `resize`      | `when`: the dimension values it reaches |

`focus` (optional) is where keyboard focus ends up. The compiler checks that
`target` exists in the `from` state, and that `focus` exists after the
transition. `dimensions transitions menu` lists them, and
`contexts menu --tree --transitions` draws them under the states. A
transition can be verified like a context (`verify --transition`).

## Includes and include states

`{ "include": "toolbar" }` puts the component's subtree in place. A root can
fix some of an included node's state groups. On the article page the blog
link is the current page's link, so it is always `selected`:

```json
{
  "include": "toolbar",
  "states": {
    "blog-link": { "selection": ["selected"] },
    "menu-blog-link": { "selection": ["selected"] }
  }
}
```

This narrows the root's contexts without changing the component. Set it with
`dimensions node include-states article-page toolbar blog-link selection
selected`.

## Custom attributes

A **custom attribute** is a value per state, with declared values. For
example, a `design` attribute says whether each state has a design yet:

```json
"customAttributes": { "design": { "values": ["missing", "ready"] } },
"types": { "toolbar-link": { "stateGroups": ["hover"],
  "customAttributes": { "design": { "rest": "ready", "hovered": "missing" } } } }
```

A node with a type can set its own values, and overrides can change them per
dimension value. `show` shows the resolved values.

## Checks and verification

A **check** is a kind of verification, such as `visual` or `behavior`. Checks
are declared in `types.json` under `customChecks`, and types say which ones
their nodes need (`"checks": ["visual"]`). Every typed node must then pass
each required check in every context it exists in.

A **verification record** says that a check passed or failed in one context,
by whom and when. Records live in `verification/<root-id>.json`:

```json
{
  "node": "blog-link",
  "check": "visual",
  "result": "passed",
  "by": "pen.dev",
  "at": "2026-10-30T19:20:00Z",
  "context": { "breakpoint": "lg", "hover": "hovered", "focus": "blurred", "selection": "selected" }
}
```

A record's context gives a value for each of the node's state groups (`state`
for a plain states list) and for each dimension that applies to it. A
dimension it leaves out means that dimension's default, so the record above is
for a mouse and a keyboard. The context must exist. A record can also name a `transition` instead of a
context. `dimensions verify` writes records and `unverify` removes them.
`dimensions status` reports every required check as passed, failed or
missing.

## Expectations

`expectations.json` states how many contexts a filter must find. `validate`
checks them once the project compiles, so a modeling mistake shows up as an
error:

```json
{
  "title": "Touch screens never show hover",
  "node": "toolbar",
  "subtree": true,
  "root": "article-page",
  "where": { "pointer": "touch", "hover": "hovered" },
  "count": 0
}
```

`where` filters work like `contexts` filters: dimension values, state group
values and shared node states.

## Views and axes

A **view** is one picture of a node's subtree: one value for each dimension
that applies in it, plus a state for each shared node present. Inside a view,
leaf nodes still list their states. `dimensions views toolbar` lists every
distinct view (one diagram each), and `dimensions view toolbar breakpoint=base
menu=open` prints the tree in one of them. `dimensions axes toolbar` lists
what a view accepts: the dimensions with values and defaults, and the shared
nodes with their states and where they exist.
