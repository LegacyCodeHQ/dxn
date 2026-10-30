# Agent Instructions

`task-tree` is a Node.js command-line tool written in TypeScript. It records a tree
of tasks, the dimensions each task varies over, and what has been specified,
built and verified for every applicable combination. Data is stored as JSON.

## Workflow

- Write a failing test first, confirm it fails, then implement the smallest
  change that makes it pass.
- One capability per commit. Run `make check` before pushing; the hooks enforce
  the same gates.
- Commit directly to `main`. Rebase, never merge.

## Commits

Subjects follow `type: lowercase imperative summary` with no trailing period.
Allowed types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`,
`chore`, `style`. The `commit-msg` hook rejects anything else.

## Code

- ES modules only; relative imports use the `.js` extension (NodeNext).
- Keep the CLI testable: `run(argv, io)` takes its output streams as arguments
  and returns the exit code. Do not call `process.exit` inside commands.
- Machine-readable output is JSON on stdout; diagnostics go to stderr.
- Exit codes: `0` success, `1` a check failed, `2` usage error.
- No source-file dependency cycles (`make cycles`).

## Commands

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `make setup-hooks` | Point git at `.githooks/` (run once per clone) |
| `make test`        | Run the Vitest suite                           |
| `make coverage`    | Run tests with coverage thresholds             |
| `make lint-check`  | Biome format + lint, then `tsc --noEmit`       |
| `make check`       | Full gate used by pre-push and CI              |
| `make fmt`         | Format with Biome                              |
