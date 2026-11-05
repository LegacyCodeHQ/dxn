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
- Source imports use package-qualified aliases: `@language/*`, `@cli/*`,
  `@language-server/*` and `@vscode/*`, still with `.js` extensions. Within
  production code, use only that package's alias; cross-package imports use
  the package's public name, such as `@legacycodehq/dxn-language`. Root
  `tsconfig.json` maps all aliases for tools and tests; a package build maps
  only its own alias. `make build` rewrites aliases in emitted JavaScript and
  declarations to relative paths, so Node needs no alias loader.
- Keep the CLI testable: `run(argv, io)` takes its output streams as arguments
  and returns the exit code. Do not call `process.exit` inside commands.
- Machine-readable output (`--json`) is JSON on stdout; diagnostics go to stderr.
- Exit codes: `0` success, `1` a check failed, `2` usage error.
- No source-file dependency cycles (`make cycles`).
- Source-layer and package boundaries are enforced by `make boundaries`, in
  both quality gates, pre-commit and CI. Rules are explicit allowlists in
  `scripts/boundaries/rules.mjs`; new source layers need a reviewed rule.
  Syntax reading and formatting cannot depend on evaluation, evidence, editor
  code or the public barrel. Only the parsing facades `syntax/parse.ts` and
  `syntax/parse-tree-sitter.ts` orchestrate analysis. The Tree-sitter facade
  alone imports the grammar binding through its public package API.
  CLI and language-server source may import the language only by its public
  package name. Tests may cross boundaries; production code cannot import tests.
- The CLI and the language server only adapt input and output: files and
  streams on one side, editor requests on the other. Every decision, such as
  what is a problem, what is loaded, or when a rename is refused, lives in
  `packages/language` as one function both call. Never add a check to one
  side only.
- Both say one vocabulary, from `packages/language/src/core/vocabulary.ts`: the
  same word for the same thing. The CLI is read by agents, so it says every
  fact and the next step, in text and in full in `--json`; an editor is read
  by people and may say less, never something else (see "Two readers" in
  `docs/language/design.md`). `make vocabulary` fails on a word of the model
  written in the CLI or the language server.
- The CLI reads and writes files on disk. The language server reads what the
  editor has: an open buffer, unsaved changes and all, else the file on disk;
  it never writes, but sends the editor edits, of only what changes. Both
  give the same functions in `packages/language` their input.
- An editor feature that mirrors a command has a scenario in
  `packages/language-server/test/parity.test.ts`, which runs it through both
  and fails when they disagree. Add one with each new feature or rule.

## Commands

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `make setup-hooks` | Point git at `.githooks/` (run once per clone)           |
| `make test`        | Run the Vitest suite                                     |
| `make coverage`    | Run tests with coverage thresholds                       |
| `make lint-check`  | Biome format + lint, then `tsc --noEmit`                 |
| `make boundaries`  | Enforce source-layer and public package dependency rules |
| `make brand`       | Test the brand tools under `brand/`                      |
| `make check`       | Full gate used by pre-push and CI                        |
| `make fmt`         | Format with Biome                                        |
