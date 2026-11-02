# Agent Instructions

`dxn` is a Node.js command-line tool written in TypeScript. It checks `.dxn`
files, written in a language for the states a thing has and the dimensions it
varies over, and evaluates every combination they give. Evidence for those
combinations is stored as JSON files beside each `.dxn` file.

## Workflow

- Write a failing test first, confirm it fails, then implement the smallest
  change that makes it pass.
- A test that checks several values collects them with `snapshot.push(...)` and
  asserts once with `expect(snapshot).toMatchInlineSnapshot()`; run
  `npx vitest run -u` to fill it in and review the result. A new, empty
  inline snapshot is written rather than failed, so confirm a test is red with
  `CI=1 npx vitest run` first. Temporary project
  paths appear as `<tmp>`. Parameterized `it.each` tests keep plain assertions.
- One capability per commit. Run `make check` before pushing; the hooks enforce
  the same gates.
- Commit directly to `main`. Rebase, never merge.
- Review a construct of the language by the checklist in
  `docs/language/review.md`, and mark it there when it is done.

## Commits

Subjects follow `type: lowercase imperative summary` with no trailing period.
Allowed types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`,
`chore`, `style`. The `commit-msg` hook rejects anything else.

## Code

- ES modules only; relative imports use the `.js` extension (NodeNext).
- Keep the CLI testable: `run(argv, io)` takes its output streams as arguments
  and returns the exit code. Do not call `process.exit` inside commands.
- Machine-readable output (`--json`) is JSON on stdout; diagnostics go to stderr.
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
