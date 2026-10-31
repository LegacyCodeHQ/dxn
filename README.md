# dxn

Track what has been specified, built and verified for a tree of nodes, across
every dimension a node varies over: breakpoints, themes, interaction states,
environments, roles, feature flags and so on.

A UI component is one kind of node; an endpoint, a migration or a background job
are others. Each node declares the dimensions that apply to it, and `dxn`
expands those into the cells that still need verifying.

## For agents

Everything is a CLI call that prints JSON, run inside a project (the nearest
`.dxn/` folder, or `--dir`). To learn a project before changing it:

```bash
dxn workflow                # the step-by-step guide to building a model
dxn --help                  # every command
dxn help contexts           # one command's usage; no project needed
dxn validate                # does the project compile? errors: file:line:col: code: message
dxn tree                    # the roots and fragments
dxn dimension list          # what nodes vary over
dxn profile list            # the combinations of dimension values that exist
dxn type list               # each type's states, checks and values
dxn check list              # declared checks and the types that require them
dxn axes toolbar            # what view and show accept for a node
dxn contexts toolbar --subtree --tree   # every combination, merged, for reading
dxn contexts blog-link --table          # a Markdown table per state group, a row per profile
dxn views toolbar --table   # one row per diagram to draw
dxn view toolbar profile=phone menu=open --tree   # the tree in one view, as text
dxn show blog-link pointer=touch        # one node in one context
dxn status                  # each required check: passed, failed or missing
```

To record a result, use `dxn verify <node> --check <c> --result
passed|failed --by <who> <name>=<value>...`. The check must be declared
and required by the node's type first: `check list` shows what is, and
`check add` and `type require` set it up. To change the model, use the
editing commands (`node`, `type`, `dimension`, `override`, …) rather than
editing the files: they refuse any change that would break the project, and
`--dry-run` shows what they would write. Exit code 1 means the project
refused, 2 means the command line is wrong.

To build a model from an empty folder, run `dxn workflow`: it prints
the step-by-step guide ([workflow.md](packages/cli/docs/workflow.md)) as Markdown, from the
program itself, so it works wherever the tool is installed.

The [docs](packages/cli/docs/) explain the rest:

- [workflow.md](packages/cli/docs/workflow.md): building a model step by step
- [concepts.md](packages/cli/docs/concepts.md): nodes, types, state groups, dimensions,
  overrides, shared states, transitions, verification and expectations, using
  a real toolbar as the example
- [commands.md](packages/cli/docs/commands.md): every command, with its usage and examples
- [diagnostics.md](packages/cli/docs/diagnostics.md): every error code and how to fix it
- [output.md](packages/cli/docs/output.md): the JSON each command prints, and exit codes

## Development

Requires Node.js 22+, [gitleaks](https://github.com/gitleaks/gitleaks) and,
optionally, [clarity](https://github.com/LegacyCodeHQ/clarity-cli) for the
file-cycle check.

```bash
npm ci
make setup-hooks
make check
```

Run the CLI from source after building:

```bash
make build
node dist/main.js --help
```
