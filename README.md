# dxn

A language for the states a thing has across every dimension it varies over:
breakpoints, pointers, themes, profiles and so on. A `.dxn` file declares
enums, dimensions, types with their states and children, environments,
profiles and records; `dxn` checks it, evaluates the states each type has in
each combination, and keeps the evidence for those combinations as JSON files
beside it.

## Example

```text
# wordmark.dxn: the wordmark's hover only exists with a mouse.
enum Hover = rest | hovered
dimension Pointer = mouse | touch
type Wordmark needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse
}
environment Device = Pointer
profile Laptop: Device { Pointer = mouse }
profile Phone: Device { Pointer = touch }
```

```bash
$ dxn check wordmark.dxn
wordmark.dxn: 1 enum, 1 dimension, 1 type, 1 environment, 2 profiles
$ dxn states wordmark.dxn Wordmark
| profiles | Pointer | hover         |
| -------- | ------- | ------------- |
| Laptop   | mouse   | rest, hovered |
| Phone    | touch   | rest          |
$ dxn cases wordmark.dxn Wordmark
Wordmark: 3 cases

| Pointer | hover   |
| ------- | ------- |
| mouse   | rest    |
| mouse   | hovered |
| touch   | rest    |
```

`dxn validate`, `attach`, `status` and `rename` work on the records stored
beside a file. Every command prints a readable answer, or one JSON document
with `--json`; problems are printed as `file:line:col: severity: code: message`. Exit
code 1 means the file has a problem or the command refused, 2 means the
command line is wrong.

- [tutorials](docs/tutorials/README.md): one button from nothing to a model
  with evidence and tests, a step at a time
- [guide.md](docs/language/guide.md): the language, one concept
  at a time, and every diagnostic code
- [commands.md](docs/commands.md): every command, with its usage
  and examples
- [tree-sitter-dxn](packages/tree-sitter-dxn/README.md): a tree-sitter grammar for dxn, for highlighting

## Development

Requires Node.js 22+, [gitleaks](https://github.com/gitleaks/gitleaks) and,
optionally, [clarity](https://github.com/LegacyCodeHQ/clarity-cli) for the
file-cycle check.

```bash
npm ci
make setup-hooks
make check
```

`make check` includes coverage for all five npm workspaces and the Zed Rust
crate. Install the Rust coverage tools once, in addition to the Rust toolchain
and WebAssembly target already needed by `make zed`:

```bash
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --version 0.9.1 --locked
```

Run coverage with `npm run coverage` or `make coverage`. CI runs the same command
and uploads the `coverage` artifact, including HTML and LCOV reports:

| Report                         | Location                          |
| ------------------------------ | --------------------------------- |
| JavaScript and TypeScript HTML | `coverage/javascript/index.html`  |
| JavaScript and TypeScript LCOV | `coverage/javascript/lcov.info`   |
| Zed Rust HTML                  | `coverage/zed/html/index.html`    |
| Zed Rust LCOV                  | `coverage/zed/lcov.info`          |
| Summary for every package      | `coverage/workspace-summary.json` |

Use `make coverage-javascript` or `make coverage-zed` to run one tool separately.
For a single npm package, use `npm run coverage:javascript -- --project=language`
(or `cli`, `language-server`, `vscode`, `tree-sitter-dxn`). A filtered run replaces
the JavaScript report with that run's results; rerun the full command for the
workspace summary.

The JavaScript report includes untested source files, the VS Code bundler and
the tree-sitter grammar DSL. The existing thresholds (70% lines, 85% functions)
apply globally and independently to the language, CLI, language-server and
VS Code packages. The CLI/server entry-point wrappers and VS Code-only extension
entry point remain excluded; their portable logic is tested separately.
Generated parsers, declarations, tests and dependencies are outside the reporting
scope.

The tree-sitter tests exercise the generated native parser, not `grammar.js`
inside Vitest, so the DSL appears as uncovered. Its correctness is checked by
the corpus, agreement and editor-query tests. Rust coverage includes untested
Zed host callbacks. These reports expose the gaps; no separate threshold is
imposed on the grammar DSL or Rust package yet. Native Rust branch coverage is
not enabled, so the package summary shows `n/a` where a metric is unavailable.

Run the CLI from source after building:

```bash
make build
node dist/main.js --help
```

### Source imports

Use a package-qualified alias for TypeScript source imports, with the `.js`
extension required by NodeNext:

```ts
import type { ParseResult } from "@language/core/ast.js";
import { parse } from "@language/syntax/parse.js";
```

| Alias                | Source directory                 |
| -------------------- | -------------------------------- |
| `@language/*`        | `packages/language/src/*`        |
| `@cli/*`             | `packages/cli/src/*`             |
| `@language-server/*` | `packages/language-server/src/*` |
| `@vscode/*`          | `packages/vscode/src/*`          |

Production code uses its own package's alias. Cross-package imports use public
package names, such as `@legacycodehq/dxn-language`; tests may use source aliases
across packages. Test helpers and files outside `src` keep relative imports.

Root `tsconfig.json` declares all source aliases for type checking, editors,
Vitest, esbuild and Clarity. Each compiled package's `tsconfig.build.json` maps
only its own alias. Vitest enables Vite's tsconfig path resolution, and the
extension bundler reads the root tsconfig automatically.

`make build` and each package's `npm run build` run `tsc-alias` after TypeScript.
This rewrites both JavaScript and declaration imports to relative paths. Built
commands run directly in Node, with no runtime alias loader. Running `tsc` alone
does not perform that rewrite; use the build commands for runnable output.

`make boundaries` enforces the [source dependency rules](docs/architecture/README.md#enforced-boundaries),
including layer direction and use of public package names across packages. It
runs in both quality gates, pre-commit and CI, and uses the installed npm tools.
