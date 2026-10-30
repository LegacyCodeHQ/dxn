# Concepts

task-tree models work as a tree of **tasks**, says which **states** each task
can be in and under which **dimensions** (breakpoint, pointer, …), and records
whether each resulting combination has been checked. Everything lives in JSON
files in a `.task-tree/` folder. The CLI edits them safely and answers
questions about them.

The running example is the toolbar of a blog (the `neo-website` project). It
has a wordmark, a blog link shown on wide screens, and a menu button that
opens a panel with the same link on narrow screens.

- [The project folder](#the-project-folder)
- [Tasks, pages and components](#tasks-pages-and-components)
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
.task-tree/
  types.json                  state groups, attributes, checks and types
  tasks/<page-id>.json        one page (a root task) per file
  components/<id>.json        one reusable component per file
  dimensions/<name>.json      one dimension per file
  overrides/<name>.json       presence and overrides for one dimension
  overrides/<a>+<b>.json      overrides for combinations of dimensions
  verification/<page-id>.json check results for tasks on that page
  expectations.json           counts the model must produce
```

`task-tree init` creates the folder. Commands find the nearest `.task-tree`
in the working directory or above, or the one `--dir` names. Every file has
`"version": 1`, and every file has a JSON schema in `schema/`.

`task-tree validate` compiles the whole folder and reports every error with
its file, line and column. There are no warnings: a project either compiles
or it doesn't. Every editing command compiles the result before it writes
anything, so a command can't leave the project broken. See
[diagnostics.md](diagnostics.md).

## Tasks, pages and components

A **task** is anything to be built and checked: a page, a toolbar, a link.
It has an `id` (unique across the project), a `title`, and optionally a
`type` and `children`. A task is not necessarily a UI component. "Links" is a
task that only groups the blog link.

A **page** is a root task in `tasks/<id>.json`. A **component** is a root task
in `components/<id>.json` that pages (or other components) **include**:

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
  "task": { "id": "article-page", "title": "Article page", "children": [{ "include": "toolbar" }] }
}
```

`task-tree tree` prints the pages and the components.

## Types and states

A **type** says which states its tasks have. It is declared once in
`types.json`, and every task with that type gets them. A type's states are
either a plain list:

```json
"menu": { "states": ["closed", "open"], "shared": true }
```

or a set of state groups (next section). A task without a type has no states.

`task-tree query blog-link` shows a task's states in one context.

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

A **dimension** is something outside the task that changes what it looks like
or does, such as screen width or input device. Each dimension has its own file:

```json
// dimensions/breakpoint.json
{ "version": 1, "values": ["base", "sm", "lg", "xl"], "default": "xl",
  "appliesTo": ["toolbar"] }
```

- `values` are the dimension's values, in order.
- `appliesTo` lists tasks. The dimension applies to each one and to its whole
  subtree, wherever it is included.
- `default` is the value a query means when it leaves the dimension out.
  Without a default, a query that leaves the dimension out doesn't apply it.

The toolbar has three dimensions: `breakpoint` (base, sm, lg, xl), `pointer`
(mouse, touch) and `keyboard` (keyboard, no-keyboard).

A **context** is one value for every dimension that applies to a task, one
value for each of its state groups (or its one plain state), and the state of
every shared task above it. `task-tree contexts blog-link` lists all of
them, `--count` counts them, and `--tree` draws them as a merged tree.
`task-tree dimensions` lists every dimension.

## Presence: only

Some tasks exist only at some values of a dimension. The blog link is only on
wide screens, and the menu only on narrow ones. `only` in
`overrides/<dimension>.json` says so, for the task and its whole subtree:

```json
// overrides/breakpoint.json
{ "version": 1,
  "only": { "toolbar-links": ["lg", "xl"], "menu": ["base", "sm"] },
  "overrides": {} }
```

A task left out of `only` exists at every value. `query` reports
`"present": false` where a task doesn't exist, and `contexts` skips those
contexts. Set it with `task-tree only breakpoint menu base sm`.

## Overrides

An **override** changes a type's or a task's states (or custom attribute
values) at one value of a dimension. On a touch screen nothing can be
hovered:

```json
// overrides/pointer.json
{ "version": 1, "overrides": {
  "touch": { "types": {
    "toolbar-link": { "states": { "remove": ["hovered"] } },
    "wordmark":     { "states": { "remove": ["hovered"] } } } } } }
```

`types` overrides every task of that type, and `tasks` overrides one task by
id. Either one can `add` states as well as `remove` them. A task can only be
overridden by a dimension that applies to it.

A **combination override** applies only where several dimensions take given
values together. It lives in `overrides/<a>+<b>.json`, with dimension names in
alphabetical order, nested in that order:

```json
// overrides/breakpoint+pointer.json
{ "version": 1, "overrides": { "sm": { "touch": { "tasks": { "…": {} } } } } }
```

**Precedence**, weakest first:

1. the type's own states and values
2. type overrides for one dimension
3. type overrides for combinations, fewer dimensions first
4. the task's own values
5. task overrides for one dimension
6. task overrides for combinations, fewer dimensions first

Two overrides at the same level that disagree in a context they share are a
`conflicting-override` error. To settle it, add a combination override for
those values, which outranks both.

Set overrides with `task-tree override states pointer=touch --type
toolbar-link --remove hovered`. For a combination, write
`breakpoint=sm,pointer=touch`.

## Shared states and onlyWhen

Some states change what exists below a task, not just how the task looks.
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
named by the task's id (`menu=open`). The ancestor in `onlyWhen` must be in
the same file. Every context of a task below `menu` includes the menu's
state, so filters like `contexts toolbar --subtree menu=open` work.

## Transitions

A shared task can list how its state changes, as DOM events:

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
| `click`       | `target`: the task clicked              |
| `keydown`     | `key`, as `KeyboardEvent.key` names it  |
| `pointerdown` | `target`, or `outside`: a task          |
| `resize`      | `when`: the dimension values it reaches |

`focus` (optional) is where keyboard focus ends up. The compiler checks that
`target` exists in the `from` state, and that `focus` exists after the
transition. `task-tree transitions menu` lists them, and
`contexts menu --tree --transitions` draws them under the states. A
transition can be verified like a context (`verify --transition`).

## Includes and include states

`{ "include": "toolbar" }` puts the component's subtree in place. A page can
fix some of an included task's state groups. On the article page the blog
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

This narrows the page's contexts without changing the component. Set it with
`task-tree task include-states article-page toolbar blog-link selection
selected`.

## Custom attributes

A **custom attribute** is a value per state, with declared values. For
example, a `design` attribute says whether each state has a design yet:

```json
"customAttributes": { "design": { "values": ["missing", "ready"] } },
"types": { "toolbar-link": { "stateGroups": ["hover"],
  "customAttributes": { "design": { "rest": "ready", "hovered": "missing" } } } }
```

A task with a type can set its own values, and overrides can change them per
dimension value. `query` shows the resolved values.

## Checks and verification

A **check** is a kind of verification, such as `visual` or `behavior`. Checks
are declared in `types.json` under `customChecks`, and types say which ones
their tasks need (`"checks": ["visual"]`). Every typed task must then pass
each required check in every context it exists in.

A **verification record** says that a check passed or failed in one context,
by whom and when. Records live in `verification/<page-id>.json`:

```json
{
  "task": "blog-link",
  "check": "visual",
  "result": "passed",
  "by": "pen.dev",
  "at": "2026-10-30T19:20:00Z",
  "context": { "breakpoint": "lg", "hover": "hovered", "focus": "blurred", "selection": "selected" }
}
```

A record's context gives a value for each of the task's state groups (`state`
for a plain states list) and for each dimension that applies to it. A
dimension it leaves out means that dimension's default, so the record above is
for a mouse and a keyboard. The context must exist. A record can also name a `transition` instead of a
context. `task-tree verify` writes records and `unverify` removes them.
`task-tree status` reports every required check as passed, failed or
missing.

## Expectations

`expectations.json` states how many contexts a query must find. `validate`
checks them once the project compiles, so a modeling mistake shows up as an
error:

```json
{
  "title": "Touch screens never show hover",
  "task": "toolbar",
  "subtree": true,
  "page": "article-page",
  "where": { "pointer": "touch", "hover": "hovered" },
  "count": 0
}
```

`where` filters work like `contexts` filters: dimension values, state group
values and shared task states.

## Views and axes

A **view** is one picture of a task's subtree: one value for each dimension
that applies in it, plus a state for each shared task present. Inside a view,
leaf tasks still list their states. `task-tree views toolbar` lists every
distinct view (one diagram each), and `task-tree view toolbar breakpoint=base
menu=open` prints the tree in one of them. `task-tree axes toolbar` lists
what a view accepts: the dimensions with values and defaults, and the shared
tasks with their states and where they exist.
