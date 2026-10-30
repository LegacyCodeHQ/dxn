# task-tree

Track what has been specified, built and verified for a tree of nodes, across
every dimension a node varies over: breakpoints, themes, interaction states,
environments, roles, feature flags and so on.

A UI component is one kind of node; an endpoint, a migration or a background job
are others. Each node declares the dimensions that apply to it, and `task-tree`
expands those into the cells that still need verifying.

## For agents

Everything is a CLI call that prints JSON, run inside a project (the nearest
`.task-tree/` folder, or `--dir`). To learn a project before changing it:

```bash
task-tree --help                  # every command
task-tree help contexts           # one command's usage; no project needed
task-tree validate                # does the project compile? errors: file:line:col: code: message
task-tree tree                    # the roots and components
task-tree dimensions              # what nodes vary over
task-tree axes toolbar            # what views and queries of a node accept
task-tree contexts toolbar --subtree --tree   # every combination, merged, for reading
task-tree views toolbar           # one entry per diagram to draw
task-tree query blog-link pointer=touch       # one node in one context
task-tree status                  # each required check: passed, failed or missing
```

To record a result, use `task-tree verify <node> --check <c> --result
passed|failed --by <who> <name>=<value>...`. To change the model, use the
editing commands (`node`, `type`, `dimension`, `override`, …) rather than
editing the files: they refuse any change that would break the project, and
`--dry-run` shows what they would write. Exit code 1 means the project
refused, 2 means the command line is wrong.

The [docs](docs/) explain the rest:

- [concepts.md](docs/concepts.md): nodes, types, state groups, dimensions,
  overrides, shared states, transitions, verification and expectations, using
  a real toolbar as the example
- [commands.md](docs/commands.md): every command, with its usage and examples
- [diagnostics.md](docs/diagnostics.md): every error code and how to fix it
- [output.md](docs/output.md): the JSON each command prints, and exit codes

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
