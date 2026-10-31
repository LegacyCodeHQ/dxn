# Output

Commands print JSON on stdout, so tools can parse it. Three exceptions print
text for people: `--help`, `contexts --tree` (unless `--json` is given), and
error messages. Reading commands indent their JSON. Editing commands, `init`,
`validate` and `--version` print it on one line.

## Exit codes

| Code | Meaning                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success. `--help` and `help` also exit 0.                                                                                                                         |
| `1`  | The command line is fine, but the project doesn't allow it: no project, the project has errors, an unknown node, a filter that doesn't apply, or an edit refused. |
| `2`  | The command line is wrong: an unknown command or subcommand, a missing argument, an unknown option. The usage follows the message.                                |

## Errors

Errors go to stderr. Nothing is printed on stdout, except by `validate`,
which always prints its summary. There are three forms:

```text
dimensions: node not found: nope
```

A refusal (exit 1) is one line.

```text
dimensions: missing node-id

Usage: dimensions show <node-id> [<dimension>=<value>...] [<shared-node>=<state>...]
...
```

A usage error (exit 2) is followed by the command's usage. An unknown
subcommand prints only the group's usage.

```text
/path/.dimensions/roots/x.json:6:13: undefined-type: type "nope" is not defined
```

Diagnostics are one per line (exit 1). A reading command prints them when the
project doesn't compile. An editing command prints them when its change
would break the project, which leaves the files unchanged. The codes are in
[diagnostics.md](diagnostics.md).

A **context** in the output below is an object with one key per dimension,
state group (or `state`) and shared node, each with its value, for example
`{"hover": "rest", "focus": "blurred", "breakpoint": "base", "keyboard": "keyboard", "pointer": "mouse", "menu": "closed"}`.
State groups come first, then dimensions, then shared nodes.

## Editing commands

Every command that changes files prints the paths it wrote and removed,
relative to the project directory:

```json
{ "written": ["fragments/toolbar.json"], "removed": [] }
```

With `--dry-run`, nothing is written. The output holds each file's new
content, plus the paths that would be removed:

```json
{
  "dryRun": true,
  "written": { "fragments/toolbar.json": "{\n  \"version\": 1,\n ..." },
  "removed": []
}
```

`init` prints `{"created": "<path>"}`.

## validate

```json
{ "project": "/path/.dimensions", "errors": 0 }
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
  "fragments": [ { "id": "toolbar", "title": "Toolbar", "children": [ ... ] } ] }
```

The roots, exactly as written in `roots/` and `fragments/`.

## dimension list

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

`default` is left out when the dimension has none. When profiles cover the dimension and some of its values are in no profile, `inNoProfile` lists them.

## type list, state-group list, check list, attribute list

What `types.json` declares, sorted by name:

```json
{ "types": [
    { "name": "menu", "states": ["closed", "open"], "shared": true, "checks": ["behavior"] },
    { "name": "toolbar-link", "stateGroups": { "hover": ["rest", "hovered"], "focus": ["blurred", "focused"] },
      "checks": ["visual"], "attributes": { "design": { "rest": "ready" } } } ] }
{ "stateGroups": [ { "name": "hover", "values": ["rest", "hovered"], "usedBy": ["menu-button", "toolbar-link"] } ] }
{ "checks": [ { "name": "visual", "requiredBy": ["toolbar-link"] } ] }
{ "attributes": [ { "name": "design", "values": ["missing", "ready"] } ] }
```

A type has `states` (a plain list) or `stateGroups` (each group with the
values the type uses), and `shared`, `checks` and `attributes` only when
it has them. Each list is `[]` when nothing is declared.

## show

For `show blog-link pointer=touch --root article-page`:

```json
{
  "id": "blog-link",
  "title": "Blog link",
  "type": "toolbar-link",
  "context": { "breakpoint": "xl", "keyboard": "keyboard", "pointer": "touch" },
  "present": true,
  "states": ["rest", "blurred", "focused", "selected"],
  "stateGroups": { "hover": ["rest"], "focus": ["blurred", "focused"], "selection": ["selected"] },
  "attributes": { "design": { "rest": "ready" } }
}
```

- `context` is the full context the answer is for, with defaults filled in,
  and the state of each shared node above the node. Without `--root`, a
  fragment's node is shown on its own, so the article page's include would
  not fix `selection` to `selected`.
- `present` is false when `only` or `onlyWhen` leaves the node out here. The
  states are still what the node would have.
- `states` lists every state in effect. `stateGroups` lists them by group, and
  a plain states list appears as the group `state`.
- `type`, `stateGroups` and `attributes` are left out when the node has
  none. `states` is then `[]`.

## contexts

Without `--subtree`, one entry per context, with the root it is in:

```json
{
  "node": "menu-button",
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

With `--subtree`, one entry per node in the subtree, in tree order:

```json
{
  "node": "toolbar",
  "nodes": [
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
{ "node": "blog-link", "count": 18 }
{ "node": "toolbar", "counts": { "toolbar": 16, "wordmark": 36, "blog-link": 18 }, "total": 156 }
```

The first form is for one node, and the second for `--subtree`.

With `--tree`, the output is text: one block per node with its number of
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
that changes nothing for the node is left out. `--transitions` adds a
`transitions` branch under each shared node.

With `--tree --json`, the same tree as data:

```json
{
  "node": "menu",
  "tree": [
    {
      "node": "menu",
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
shared node.

## contexts --table

`--table` prints Markdown: a `###` heading per table, then a padded table.
`✓` means the value (or node) is there in every profile of the row, `—` in
none, and a list of profiles means only in those. For one node there is a
table per state group, then `Not present: …` (rows where the node does not
exist) and `Only when …` (states of a shared node it needs). With `--subtree`
there is one presence matrix, a row per node.

With `--json`, the same tables as data:

```json
{ "node": "blog-link", "by": ["profile"],
  "tables": [ { "group": "hover",
                "rows": [ { "row": "tablet-landscape", "values": { "rest": true, "hovered": false } } ] } ],
  "notPresent": ["phone", "tablet-portrait"] }

{ "node": "toolbar", "by": ["breakpoint"], "columns": ["base", "sm", "lg", "xl"],
  "rows": [ { "node": "menu-panel", "cells": [{ "menu": ["open"] }, { "menu": ["open"] }, false, false] } ] }
```

A cell is `true`, `false`, a list of the profiles (or combinations) where it
holds, or, in the matrix, the shared states a node needs. `--by` can also name a shared node, such as `--by form`, for a row per state, alone or with `profile` or dimensions (`--by profile,menu`).

## axes

```json
{
  "node": "toolbar",
  "dimensions": [{ "name": "breakpoint", "values": ["base", "sm", "lg", "xl"], "default": "xl" }],
  "shared": [
    { "node": "menu", "states": ["closed", "open"], "existsWhen": { "breakpoint": ["base", "sm"] } }
  ]
}
```

`existsWhen` gives, for each dimension that limits the shared node, the values
where it exists. It is left out when no dimension limits it. `shared` is `[]`
when there are no shared nodes.

When the project has profiles, `axes` also lists them, as `profile list` does:

```json
"profiles": [{ "name": "desktop", "values": { "breakpoint": "xl", "keyboard": "keyboard", "pointer": "mouse" } }]
```

Profiles are sorted by name. A dimension that profiles cover has no `default`.

With filters, as in `axes toolbar profile=phone`, `axes` describes only the
views the filters keep: each dimension lists the values those views have, a
shared node appears only if it exists in one of them, and `profiles` lists the
profiles they match.

## profile list

```json
{
  "profiles": [
    {
      "name": "phone",
      "values": { "breakpoint": "base", "keyboard": "no-keyboard", "pointer": "touch" }
    }
  ]
}
```

Profiles come in `profiles.json` order. A modifier on a profile is listed as
a profile of its own right after it, named `<profile>+<modifier>`, with the
modifier's values applied and `"modifier"` naming it. `"sameAs"` lists the
other profiles with the same combination, such as
`tablet-landscape+magic-keyboard` and `laptop`; both are left out when empty.

## modifier list

```json
{
  "modifiers": [
    {
      "name": "magic-keyboard",
      "on": ["tablet-portrait", "tablet-landscape"],
      "sets": { "keyboard": "keyboard", "pointer": "mouse" }
    }
  ]
}
```

## actor list

```json
{ "actors": [{ "name": "design-agent" }, { "name": "visual-reviewer" }] }
```

## evidence

```json
{
  "node": "menu",
  "actor": "design-agent",
  "contexts": [
    {
      "root": "article-page",
      "profiles": ["phone"],
      "context": {
        "breakpoint": "base",
        "keyboard": "no-keyboard",
        "pointer": "touch",
        "menu": "closed"
      },
      "evidence": [
        {
          "at": "2026-10-31T12:00:00Z",
          "source": { "file": "design/website.pen", "frame": "vbGba" },
          "fingerprint": "824028d8f908241af9555729993799556d69f07f",
          "stale": false
        }
      ]
    }
  ]
}
```

There is one item per context of the node, on each root. `profiles` names
every profile with that combination, and is left out when there are no
profiles. `evidence` is empty where the actor has none; `stale` is true when
the frame's fingerprint now differs from the one recorded, and `gone` is true
when the frame is no longer in the file. `conflicting` is true when the frame also covers
contexts of the node that the model says look different; a conflicting entry
does not count as current.

With `--by profile`, there is a row per profile (or profiles sharing a
combination), in profile order: the states the node has there, and how many
of its contexts have evidence that is present, stale or missing.
`notPresent` lists the profiles the node does not exist on.
With `--by frame`, there is a row per frame the actor pointed to: the
contexts that share it, which the design draws as one look, with its
provenance. `name` is the frame's name, for a pen.dev file. `withoutEvidence` counts the contexts no frame covers.

```json
{
  "node": "menu-button",
  "actor": "design-agent",
  "by": "frame",
  "frames": [
    {
      "file": "design/website.pen",
      "frame": "l5Z3Z",
      "actor": "design-agent",
      "at": ["2026-10-31T13:15:00Z"],
      "fingerprints": ["9f3c…"],
      "profiles": [["phone"], ["tablet-portrait"], ["tablet-portrait+magic-keyboard"]],
      "states": { "hover": ["rest"], "focus": ["blurred"], "menu": ["closed"] },
      "contexts": 3,
      "stale": 0
    }
  ],
  "withoutEvidence": 0
}
```

With `--by look`, there is a row per look: the node's `attributes` there, the
`profiles` and number of `contexts` that look like it, the `frames` that cover
them, and how many have evidence that is `present`, `stale` or `missing`.

With `--subtree`, there is a row per node under the one named, with its type
(`null` when it has none), and a cell per column, where `columns` lists the
profiles of each. A cell counts the node's contexts on those profiles: with
current evidence, stale, and in all; it is `null` where the node does not
exist. With `--by frame` too, `frames` lists each frame under the node with
the `nodes` it covers.

```json
{
  "node": "toolbar",
  "actor": "design-agent",
  "subtree": true,
  "columns": [["phone"], ["tablet-portrait"]],
  "rows": [
    {
      "node": "toolbar",
      "type": null,
      "cells": [{ "present": 0, "stale": 0, "total": 1 }, { "present": 0, "stale": 0, "total": 1 }]
    },
    {
      "node": "menu-button",
      "type": "menu-button",
      "cells": [{ "present": 2, "stale": 0, "total": 2 }, null]
    }
  ]
}
```

With `--missing`, only contexts without evidence, or with stale evidence, are
kept: the rows and `states` then show what is still to cover.

```json
{
  "node": "menu-button",
  "actor": "design-agent",
  "by": "profile",
  "rows": [
    {
      "profiles": ["phone"],
      "states": { "hover": ["rest"], "focus": ["blurred"], "menu": ["closed", "open"] },
      "contexts": 2,
      "present": 1,
      "stale": 0,
      "missing": 1
    }
  ],
  "notPresent": [["tablet-landscape"], ["laptop", "tablet-landscape+magic-keyboard"], ["desktop"]]
}
```

## views

```json
{
  "node": "toolbar",
  "views": [{ "breakpoint": "base", "keyboard": "keyboard", "pointer": "mouse", "menu": "closed" }]
}
```

Each view is a context without state group values: a value for each
dimension, plus a state for each shared node that is present in it.

## view

```json
{ "node": "toolbar",
  "context": { "breakpoint": "base", "keyboard": "keyboard", "pointer": "mouse", "menu": "open" },
  "tree": { "id": "toolbar", "title": "Toolbar", "children": [
    { "id": "wordmark", "title": "Wordmark", "type": "wordmark",
      "stateGroups": { "hover": ["rest", "hovered"], "focus": ["blurred", "focused"] } },
    { "id": "menu", "title": "Menu", "type": "menu", "state": "open", "children": [ ... ] } ] } }
```

Only the nodes present in the view appear. A shared node has its `state`.
Other typed nodes have `stateGroups` (or `states`) and `attributes`.

## transitions

```json
{
  "node": "menu",
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
      "node": "blog-link",
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

There is one item per required check, per context the node exists in, on
each root, and one per required check per transition of a shared node.
`result` is `passed`, `failed` or `missing`. A transition's item has
`transition` instead of `context`. To see which actor verified a context and when,
read `verification/<root-id>.json`.

With `--actor`, the summary and items are about evidence instead of checks:

```json
{
  "summary": { "present": 2, "stale": 0, "missing": 41 },
  "items": [
    {
      "root": "article-page",
      "node": "menu",
      "context": {
        "breakpoint": "base",
        "keyboard": "no-keyboard",
        "pointer": "touch",
        "menu": "closed"
      },
      "evidence": "present"
    }
  ]
}
```

There is one item per context of each node (or of the node named), on each
root. `evidence` is `present`, `conflicting` when an entry's frame covers
contexts that look different, `stale` when every entry's frame has changed
since, or `missing`.
