# Source dependencies

The layout follows the file dependencies reported by `clarity show`. An arrow
points from a file or folder to something it imports, including type imports.
Each Clarity module in [modules.json](../../.clarity/modules.json) corresponds to
a physical source directory; the language's public `src/index.ts` is its own node.

Source imports use `@language/*`, `@cli/*`, `@language-server/*` and `@vscode/*`.
The root [tsconfig.json](../../tsconfig.json) declares their source paths
explicitly so Clarity resolves the same dependencies as TypeScript, Vitest and
esbuild. The alias migration preserved all 252 source dependency edges.

![Source folder dependencies](dependencies.png)

| Language folder | Responsibility                                                                |
| --------------- | ----------------------------------------------------------------------------- |
| `core`          | AST, diagnostics, text, naming and shared wording                             |
| `model`         | Scalars, names, conditions, profiles and scopes                               |
| `evaluation`    | Type/value checking, state evaluation, expectations and combinations          |
| `syntax`        | Scanning, syntax reading, formatting and the compatible `parse()` entry point |
| `analysis`      | Context derivation, name resolution and ordered semantic analysis             |
| `data`          | JSON reading and duplicate detection                                          |
| `evidence`      | Stored-record validation, storage, fingerprints, review and renaming          |
| `editor`        | Definitions, completion, hover, cursor renaming, semantic tokens and symbols  |

`evaluation` depends on `model` and `core`. Syntax reading and formatting do not
run semantic analysis. The existing `syntax/parse.ts` entry point composes a fresh
syntax read with `analysis/semantic-analyzer.ts`, which derives record context, resolves
names, validates declarations with `evaluation/semantic-validator.ts`, analyzes
conditions and executes expectations.
Condition analysis enumerates a type's combinations only when a condition needs
judging, reusing them for the remaining conditions of that type. `evidence` uses
`data`, `evaluation`, `model` and `core`; `editor` combines syntax, evaluation and
evidence. These directory dependencies form a DAG. Shared dependencies stay in
sibling folders rather than being nested inside one of their several consumers.

`SyntaxResult`, `ResolvedResult` and `ParseResult` distinguish the stages at
compile time. Their optional, private symbol markers are erased: runtime keys,
JSON and diagnostics are unchanged, and structurally constructed files remain
compatible. A resolved result is also the input shape for checks and evaluation;
it may have errors, so evaluation retains its runtime guards. A completed parse
cannot be passed back to the syntax-to-analysis or resolution entry points.
The passes still mutate their input, so callers must not reuse a syntax alias
after giving it to analysis. TypeScript does not enforce ownership of that alias.

The unused `fieldValue` export and its helper were removed after the `PenNode`
evidence model replaced their callers. Derived-field syntax, checks, storage
validation, navigation and renaming remain supported.

The CLI's `commands/index.ts` dispatches to commands; their shared context,
reporting, stored-record helpers, wording, tables and I/O types live in
`commands/support`. The language server's `protocol` folder adapts diagnostics,
evidence and ranges to LSP. Package boundaries, executable entry points and the
language package's public exports stay the same. Tests retain their existing
behavior-oriented organization and import the relocated implementation files.

The graph covers the four TypeScript packages' source files. It does not show
external libraries, build-time bundling, process startup or runtime protocol
connections. In particular, VS Code launches the language server and CLI but does
not import their source files, so its collapsed node has no outgoing edges.
Generated tree-sitter sources and the Rust extension retain their tool-required
layouts. The grammar stays byte-for-byte identical to the revision Zed pins;
its README links to the current authoritative parser.

## Enforced boundaries

Run `make boundaries` to test the checker and validate every TypeScript and
JavaScript file under `packages/*/src`. It also runs in `make check`,
`make check-fast`, pre-commit and CI. Tests and build scripts are outside this
production-source policy; production imports of test or build code are rejected.
Native Rust and generated C dependencies are outside this check's scope.

The allowlists live in [rules.mjs](../../scripts/boundaries/rules.mjs).
Each language layer may depend on the following layers, including itself only
when listed:

| Source                                           | Allowed destinations                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `core`                                           | `core`                                                                |
| `model`                                          | `core`, `model`                                                       |
| `data`                                           | `core`, `data`                                                        |
| `evaluation`                                     | `core`, `model`, `evaluation`                                         |
| `syntax`, except parsing facades                 | `core`, `model`, syntax reading and formatting                        |
| `syntax/parse.ts`, `syntax/parse-tree-sitter.ts` | `core`, syntax reading, `analysis`                                    |
| `analysis`                                       | `core`, `model`, `evaluation`                                         |
| `evidence`                                       | `core`, `model`, `data`, `evaluation`, `evidence`                     |
| `editor`                                         | `core`, `model`, `evaluation`, `evidence`, `syntax`, `editor`         |
| Public `index.ts`                                | `core`, `model`, `data`, `evaluation`, `evidence`, `syntax`, `editor` |

Only the exact `syntax/parse.ts` and `syntax/parse-tree-sitter.ts` files have the
orchestration exception. The latter alone may import the grammar binding through
`@legacycodehq/tree-sitter-dxn`. Other syntax files cannot reach analysis indirectly
through either facade or the public barrel. New top-level source folders must be
classified explicitly.

CLI entry files may depend on commands and support; commands may depend on other
commands and support; support stays within support. Language-server entry files
may depend on protocol adapters; protocol adapters stay within protocol. VS Code
source stays within its own package. The CLI and language server may additionally
import the language through exactly `@legacycodehq/dxn-language`. Cross-package
relative paths, source aliases, file URLs and package subpaths do not substitute
for that public package name. Language implementation code cannot import its
own public barrel to bypass the layer rules.

The checker parses imports instead of searching text. It includes type-only
imports, type queries, re-exports and literal dynamic imports, resolves tsconfig
aliases and normalizes their destinations before applying the rules. Comments
and example strings are ignored. Computed module specifiers, unresolved local
imports and syntax errors fail the check. Dependency cycles remain the separate
responsibility of `make cycles`.

## Snapshots

- [Original whole-project graph](dependencies-before.mmd), including tests and docs.
- [Original source graph](source-before.dot) and [reorganized source graph](source-after.dot).
- [Folder graph as Mermaid](dependencies.mmd) and [Graphviz](dependencies.dot).

The original reorganization moved 47 source files and preserved all 251 source
dependency edges after mapping old paths to new paths. The current source and
folder graphs also include the subsequent separation of syntax reading from
analysis. Neither files nor source folders have dependency cycles.

## Regenerate

From the repository root, after staging renames so Clarity sees the current
paths rather than deleted files' historical dependencies:

```sh
clarity show packages/language/src packages/cli/src packages/language-server/src packages/vscode/src --format dot --no-stats > docs/architecture/source-after.dot
clarity show packages/language/src packages/cli/src packages/language-server/src packages/vscode/src --collapse --format mermaid --no-stats > docs/architecture/dependencies.mmd
clarity show packages/language/src packages/cli/src packages/language-server/src packages/vscode/src --collapse --format dot --no-stats > docs/architecture/dependencies.dot
dot -Tpng docs/architecture/dependencies.dot -o docs/architecture/dependencies.png
```

## Grammar-change propagation model

[dxn-codebase.dxn](dxn-codebase.dxn) models the review responsibilities triggered
by changing `grammar.js`, `src/scanner.c`, or both. The tree stays at the main
component level: parser agreement, semantic analysis, formatting, diagnostics,
CLI, language server, editor clients and direct Zed/VS Code syntax support.
It does not model all package imports, execution order, implementation completion,
or verification results.
Implementation and verification evidence belong in separate records.

Each `has` edge means “review this consumer because of this upstream change.”
A review may conclude that its existing implementation already handles the change.
`VSCodeExtensionImpact` makes that choice explicit with `required-change:
RequiredChange`, whose values are `modify` and `keep`. Both are permitted; the
model does not infer the choice from whether the grammar or scanner changed.
The state describes required work, while implementation and verification results
remain separate records.
A responsibility appearing in several branches identifies several causes; it
does not instruct us to perform the same implementation change several times.

Verification responsibilities are explicit child nodes for the language server,
each editor's LSP client, and each editor's direct syntax integration. Their
model documentation distinguishes automated checks from developer-performed
checks in the actual editor. VS Code's `keep` choice still requires verification.
These nodes require work; they do not assert a passing result. Record outcomes,
who performed the checks and supporting evidence separately. Repeated placements
identify upstream causes; one recorded verification may cover several causes
when it exercises the affected behavior for each.

The following source details support those responsibilities. They are kept here
rather than expanded into individual nodes in the propagation tree:

| Responsibility                    | Repository boundary                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Syntax contract and examples      | `docs/language/guide.md`, `syntax-contract.md`, shared agreement fixtures                               |
| Generated parser and scanner      | `packages/tree-sitter-dxn/grammar.js`, `src/`, grammar/scanner change dimension                         |
| Grammar highlighting              | `packages/tree-sitter-dxn/queries/highlights.scm`                                                       |
| Native binding and distribution   | Grammar `binding.gyp`, `bindings/node/`, npm manifests/lock, build and CI inputs                        |
| AST adapter and migration entry   | Language `syntax/tree.ts`, `syntax/parse-tree-sitter.ts`                                                |
| Shared syntax reader and recovery | Language `syntax/read.ts`, `scan.ts`, partial declarations and source positions                         |
| AST and public language contract  | Language `core/ast.ts`, `src/index.ts`                                                                  |
| Scoping and semantic rules        | Language `analysis/`, `model/`, `evaluation/semantic-validator.ts`, `check-types.ts`, `check-values.ts` |
| Evaluation and composition        | Language `evaluation/`, `model/profiles.ts`, `model/tree.ts`                                            |
| Stored evidence                   | Language `evidence/`, including validation, compatibility, counts and review output                     |
| Formatting                        | Language `syntax/format.ts`, including its own token splitting and syntax-reader gate                   |
| Diagnostics                       | Shared severity, codes, wording and locations; CLI text/JSON and LSP conversions                        |
| Navigation and source edits       | Language `editor/`, source/stored-name renaming and re-analysis                                         |
| CLI and language server           | `packages/cli/src/`, `packages/language-server/src/`                                                    |
| VS Code consumers                 | LSP client, bundled command execution, TextMate grammar and language configuration                      |
| Zed consumers                     | LSP client, grammar pin, five query families, task commands and language configuration                  |

The Tree-sitter migration is an implementation detail of the parser work.
`parseTreeSitter()` currently supports only focused
declarations and rejects unsupported/recovered trees. The CLI and language server
still use `parse()`, and formatting independently calls `read()`. Drawing an
active migration-to-CLI/LSP path now would misrepresent the code. Review that
connection when the migration replaces those readers, including native deployment
in VS Code bundles.

For example, a documentation syntax change can affect attachment in the scanner,
the generated node shape, AST lowering, semantic tag rules, formatting indentation,
hover text, diagnostic locations, both highlighting systems and editor comment
configuration. These details guide the component reviews; they do not imply
that pending documentation semantics or hover integration have been implemented.

Inspect the model with the real CLI:

```sh
dxn check docs/architecture/dxn-codebase.dxn
dxn tree docs/architecture/dxn-codebase.dxn
dxn states docs/architecture/dxn-codebase.dxn ModifyTreeSitterPackage
dxn states docs/architecture/dxn-codebase.dxn ModifyZedExtension
dxn states docs/architecture/dxn-codebase.dxn VSCodeExtensionImpact
```

The model must have one propagation root, `ModifyDxnGrammar`. All three change
sources require reviewing the modeled consumers and updating the Zed pin;
only grammar changes (including `both`) regenerate the parser sources.
