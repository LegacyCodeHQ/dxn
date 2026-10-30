# Output

Commands print JSON on stdout, so tools can parse it. Three exceptions print
text for people: `--help`, `contexts --tree` (unless `--json` is given), and
error messages. Reading commands indent their JSON. Editing commands, `init`,
`validate` and `--version` print it on one line.

## Exit codes

| Code | Meaning                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success. `--help` and `help` also exit 0.                                                                                                                         |
| `1`  | The command line is fine, but the project doesn't allow it: no project, the project has errors, an unknown task, a filter that doesn't apply, or an edit refused. |
| `2`  | The command line is wrong: an unknown command or subcommand, a missing argument, an unknown option. The usage follows the message.                                |

## Errors

Errors go to stderr. Nothing is printed on stdout, except by `validate`,
which always prints its summary. There are three forms:

```text
task-tree: task not found: nope
```

A refusal (exit 1) is one line.

```text
task-tree: missing task-id

Usage: task-tree query <task-id> [<dimension>=<value>...] [<shared-task>=<state>...]
...
```

A usage error (exit 2) is followed by the command's usage. An unknown
subcommand prints only the group's usage.

```text
/path/.task-tree/tasks/x.json:6:13: undefined-type: type "nope" is not defined
```

Diagnostics are one per line (exit 1). A reading command prints them when the
project doesn't compile. An editing command prints them when its change
would break the project, which leaves the files unchanged. The codes are in
[diagnostics.md](diagnostics.md).

A **context** in the output below is an object with one key per dimension,
state group (or `state`) and shared task, each with its value, for example
`{"hover": "rest", "focus": "blurred", "breakpoint": "base", "keyboard": "keyboard", "pointer": "mouse", "menu": "closed"}`.
State groups come first, then dimensions, then shared tasks.

## Editing commands

Every command that changes files prints the paths it wrote and removed,
relative to the project directory:

```json
{ "written": ["components/toolbar.json"], "removed": [] }
```

With `--dry-run`, nothing is written. The output holds each file's new
content, plus the paths that would be removed:

```json
{
  "dryRun": true,
  "written": { "components/toolbar.json": "{\n  \"version\": 1,\n ..." },
  "removed": []
}
```

`init` prints `{"created": "<path>"}`.

## validate

```json
{ "project": "/path/.task-tree", "errors": 0 }
```

`errors` counts the diagnostics printed on stderr. The exit code is 1 when it
is above 0.

## --version

```json
{ "version": "0.0.0" }
```

## tree

```json
{ "roots": [ { "id": "article-page", "title": "Article page", "children": [ ... ] } ],
  "components": [ { "id": "toolbar", "title": "Toolbar", "children": [ ... ] } ] }
```

The root tasks, exactly as written in `tasks/` and `components/`.

## dimensions

```json
{
  "dimensions": [
    {
      "name": "breakpoint",
      "values": ["base", "sm", "lg", "xl"],
      "default": "xl",
      "appliesTo": ["toolbar"]
    }
  ]
}
```

`default` is left out when the dimension has none.

## query

```json
{
  "id": "blog-link",
  "title": "Blog link",
  "type": "toolbar-link",
  "context": { "breakpoint": "xl", "keyboard": "keyboard", "pointer": "touch" },
  "present": true,
  "states": ["rest", "blurred", "focused", "selected"],
  "stateGroups": { "hover": ["rest"], "focus": ["blurred", "focused"], "selection": ["selected"] },
  "customAttributes": { "design": { "rest": "ready" } }
}
```

- `context` is the full context the answer is for, with defaults filled in.
- `present` is false when `only` or `onlyWhen` leaves the task out here. The
  states are still what the task would have.
- `states` lists every state in effect. `stateGroups` lists them by group, and
  a plain states list appears as the group `state`.
- `type`, `stateGroups` and `customAttributes` are left out when the task has
  none. `states` is then `[]`.

## contexts

Without `--subtree`, one entry per context, with the root it is in:

```json
{
  "task": "menu-button",
  "contexts": [
    {
      "root": "article-page",
      "context": {
        "hover": "rest",
        "focus": "blurred",
        "breakpoint": "base",
        "keyboard": "keyboard",
        "pointer": "mouse",
        "menu": "closed"
      }
    }
  ]
}
```

With `--subtree`, one entry per task in the subtree, in tree order:

```json
{
  "task": "toolbar",
  "tasks": [
    {
      "id": "wordmark",
      "contexts": [
        {
          "hover": "rest",
          "focus": "blurred",
          "breakpoint": "base",
          "keyboard": "no-keyboard",
          "pointer": "touch"
        }
      ]
    }
  ]
}
```

With `--count`:

```json
{ "task": "blog-link", "count": 18 }
{ "task": "toolbar", "counts": { "toolbar": 16, "wordmark": 36, "blog-link": 18 }, "total": 156 }
```

The first form is for one task, and the second for `--subtree`.

With `--tree`, the output is text: one block per task with its number of
combinations, then the levels:

```text
wordmark (36 combinations)
├── keyboard=keyboard
│   ├── pointer=mouse
│   │   └── hover=rest, hovered
│   │       └── focus=blurred, focused
│   └── pointer=touch
│       └── hover=rest
│           └── focus=blurred, focused
└── keyboard=no-keyboard
    └── ...
```

Values on one line (`hover=rest, hovered`) share the same subtree. A level
that changes nothing for the task is left out. `--transitions` adds a
`transitions` branch under each shared task.

With `--tree --json`, the same tree as data:

```json
{
  "task": "menu",
  "tree": [
    {
      "task": "menu",
      "count": 16,
      "transitions": [
        { "id": "open", "from": "closed", "to": "open", "on": "click", "target": "menu-button" }
      ],
      "children": [
        {
          "name": "breakpoint",
          "values": ["base", "sm"],
          "count": 16,
          "children": [{ "name": "menu", "values": ["closed", "open"], "count": 16 }]
        }
      ]
    }
  ]
}
```

A level's `count` covers all of its `values` together. `children` is left out
at the last level, and `transitions` is there only with `--transitions` on a
shared task.

## axes

```json
{
  "task": "toolbar",
  "dimensions": [{ "name": "breakpoint", "values": ["base", "sm", "lg", "xl"], "default": "xl" }],
  "shared": [
    { "task": "menu", "states": ["closed", "open"], "existsWhen": { "breakpoint": ["base", "sm"] } }
  ]
}
```

`existsWhen` gives, for each dimension that limits the shared task, the values
where it exists. It is left out when no dimension limits it. `shared` is `[]`
when there are no shared tasks.

## views

```json
{
  "task": "toolbar",
  "views": [{ "breakpoint": "base", "keyboard": "keyboard", "pointer": "mouse", "menu": "closed" }]
}
```

Each view is a context without state group values: a value for each
dimension, plus a state for each shared task that is present in it.

## view

```json
{ "task": "toolbar",
  "context": { "breakpoint": "base", "keyboard": "keyboard", "pointer": "mouse", "menu": "open" },
  "tree": { "id": "toolbar", "title": "Toolbar", "children": [
    { "id": "wordmark", "title": "Wordmark", "type": "wordmark",
      "stateGroups": { "hover": ["rest", "hovered"], "focus": ["blurred", "focused"] } },
    { "id": "menu", "title": "Menu", "type": "menu", "state": "open", "children": [ ... ] } ] } }
```

Only the tasks present in the view appear. A shared task has its `state`.
Other typed tasks have `stateGroups` (or `states`) and `customAttributes`.

## transitions

```json
{
  "task": "menu",
  "transitions": [
    {
      "id": "escape",
      "from": "open",
      "to": "closed",
      "on": "keydown",
      "key": "Escape",
      "focus": "menu-button"
    }
  ]
}
```

Each transition is written as it is in the file. See
[concepts.md](concepts.md#transitions).

## status

```json
{
  "summary": { "passed": 1, "failed": 0, "missing": 40 },
  "items": [
    {
      "root": "article-page",
      "task": "blog-link",
      "context": {
        "hover": "rest",
        "focus": "blurred",
        "selection": "selected",
        "breakpoint": "lg",
        "keyboard": "keyboard",
        "pointer": "mouse"
      },
      "check": "visual",
      "result": "missing"
    }
  ]
}
```

There is one item per required check, per context the task exists in, on
each root, and one per required check per transition of a shared task.
`result` is `passed`, `failed` or `missing`. A transition's item has
`transition` instead of `context`. To see who verified a context and when,
read `verification/<root-id>.json`.
