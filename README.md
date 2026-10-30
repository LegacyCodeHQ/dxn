# task-tree

Track what has been specified, built and verified for a tree of tasks, across
every dimension a task varies over: breakpoints, themes, interaction states,
environments, roles, feature flags and so on.

A UI component is one kind of task; an endpoint, a migration or a background job
are others. Each task declares the dimensions that apply to it, and `task-tree`
expands those into the cells that still need verifying.

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
