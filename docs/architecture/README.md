# Source dependencies

The layout follows the file dependencies reported by `clarity show`. An arrow
points from a file or folder to something it imports, including type imports.
Each Clarity module in [modules.json](../../.clarity/modules.json) corresponds to
a physical source directory; the language's public `src/index.ts` is its own node.

![Source folder dependencies](dependencies.png)

| Language folder | Responsibility                                                               |
| --------------- | ---------------------------------------------------------------------------- |
| `core`          | AST, diagnostics, text, naming and shared wording                            |
| `model`         | Scalars, names, conditions, profiles and scopes                              |
| `evaluation`    | Type/value checking, state evaluation, expectations and combinations         |
| `syntax`        | Scanning, parsing and formatting                                             |
| `data`          | JSON reading and duplicate detection                                         |
| `evidence`      | Stored-record validation, storage, fingerprints, review and renaming         |
| `editor`        | Definitions, completion, hover, cursor renaming, semantic tokens and symbols |

`evaluation` depends on `model` and `core`. `syntax` uses those layers because
parsing also checks the declarations and expectations it reads. `evidence` uses
`data`, `evaluation`, `model` and `core`; `editor` combines syntax, evaluation and
evidence. These directory dependencies form a DAG. Shared dependencies stay in
sibling folders rather than being nested inside one of their several consumers.

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

## Snapshots

- [Original whole-project graph](dependencies-before.mmd), including tests and docs.
- [Original source graph](source-before.dot) and [reorganized source graph](source-after.dot).
- [Folder graph as Mermaid](dependencies.mmd) and [Graphviz](dependencies.dot).

The reorganization moved 47 source files and preserved all 251 source dependency
edges after mapping old paths to new paths. Neither files nor source folders
have dependency cycles.

## Regenerate

From the repository root, after staging renames so Clarity sees the current
paths rather than deleted files' historical dependencies:

```sh
clarity show packages/language/src packages/cli/src packages/language-server/src packages/vscode/src --format dot --no-stats > docs/architecture/source-after.dot
clarity show packages/language/src packages/cli/src packages/language-server/src packages/vscode/src --collapse --format mermaid --no-stats > docs/architecture/dependencies.mmd
clarity show packages/language/src packages/cli/src packages/language-server/src packages/vscode/src --collapse --format dot --no-stats > docs/architecture/dependencies.dot
dot -Tpng docs/architecture/dependencies.dot -o docs/architecture/dependencies.png
```
