# DXN — Lean-backed redesign

This worktree targets the redesigned language exclusively. Its specification is
in `lean/`; its shared TypeScript implementation is in `packages/next`.
The CLI, formatter, language server, Tree-sitter grammar and editor extensions
in this worktree support that implementation.

The current supported construct is an enumeration:

```dxn
enum Light { off, on }
enum Power {
  standby,
  no-keyboard,
  01
}
```

Enumeration names start with an ASCII capital letter and contain only ASCII
letters and digits. Values use ASCII lowercase letters and digits, with single
hyphens between them. Empty enums, duplicate members and duplicate enum names
are checker errors. Missing separators and trailing commas are syntax errors.
Keywords can be member names. Enum values carry their enumeration's identity.

Types, states, documentation and ordinary comments, evaluation and stored
records have not been specified and implemented in this redesign yet. Their
prototype syntax is rejected. `packages/language` is retained prototype source;
none of the redesigned executable adapters import it, and its tests are outside
the active redesign suite. Historical guides and examples describe the prototype.

## Build and check

Requires Node 22+, npm, Lean (elan reads `lean/lean-toolchain`), a C/C++ compiler
for native grammar tests, and Rust with the `wasm32-wasip2` target for Zed.

```sh
npm ci
make build
make check-fast
make coverage
make agreement
```

The Lean checks prove properties of the specification. Agreement checks compare
the implementation with executable Lean on shared and generated cases. They do
not prove the TypeScript implementation.

## Use the built CLI

Run this worktree's executable directly; do not replace your global installation.

```sh
node packages/cli/dist/main.js check examples/redesign/enums.dxn
node packages/cli/dist/main.js check examples/redesign/enums.dxn --json
node packages/cli/dist/main.js fmt examples/redesign/enums.dxn
node packages/cli/dist/main.js fmt examples/redesign/enums.dxn --check
node packages/cli/dist/main.js fmt examples/redesign/enums.dxn --write
node packages/cli/dist/main.js rename examples/redesign/enums.dxn Light Lamp --dry-run
```

`fmt` prints canonical one-line enums with spaces and a final newline. It never
formats malformed syntax; semantic errors do not prevent formatting.
`--write` writes the file, and `--check` exits 1 when formatting differs.
`rename` changes only the enum-name span, preserving other text. By default it
writes the result; `--dry-run` previews it. All rename refusals come from the
shared implementation. Renaming a value is not supported yet.

Commands exit 0 on success, 1 on a language/format/refactoring failure, and 2 on
invalid arguments or I/O failure. `--json` emits structured results on stdout;
text diagnostics go to stderr.

## Editors

The server supplies diagnostics, formatting, hover, enum/member outline,
semantic highlighting, declaration navigation and enumeration rename. It reads
unsaved buffers and returns versioned edits. Unsupported prototype features
such as evidence hints and state commands are not advertised.

For VS Code, build with `make build`, then use an isolated Extension Development
Host for `packages/vscode` (separate user data and extension directories). The
extension bundles this worktree's server and CLI. Do not install it over the
extension you use with the current language.

For Zed, run `make zed-dev` and install `.dxn-dev/zed` as a development extension.
This stages a separate `dxn-redesign` extension with a local grammar repository
and a real snapshot commit. It does not commit to the project's branch. The
source `packages/zed/extension.toml` is a template, not an installable package.
Configure `lsp.dxn-redesign-language-server.binary.path` to your Node executable and its
`arguments` to this worktree's absolute `packages/language-server/dist/main.js`.
Use a separate development configuration; this extension refuses to fall back
to a potentially incompatible server on PATH. Its Check task runs this
worktree's built CLI when the worktree is opened as the Zed project root.

### Manual verification still required

In each development editor, open `examples/redesign/enums.dxn` and check:

- Valid enums have no diagnostics; the old `enum Light = off | on` is rejected.
- `enum`, `on` and `type` inside braces are enum members, not keywords.
- Hover and outline identify each enumeration and member correctly.
- Formatting produces the same result as the CLI, including unsaved edits.
- Rename `Light` to `Lamp`; only its name changes. A collision with `Power`
  is refused. Renaming to the same name makes no edits.
- Duplicate members and bad names have diagnostics at the correct spans.
- Editing incomplete syntax does not crash the server; repairing it clears errors.

Automated grammar, protocol and bundle checks do not establish these human checks.

## Models

The change-propagation models in `docs/architecture/` intentionally remain in the
old DXN syntax. Inspect them using the separately built prototype CLI until the
new language supports types. They are not examples accepted by this CLI.

## Design notebook

The language decisions, reference rules and Lean excerpts live in
[`notebook/`](notebook/index.md). Build them locally with `make notebook`.
Both `make check` and `make check-fast`, and the CI quality job, build the
notebook; missing Lean regions and broken internal page links fail that gate.

The publication target is [the DXN design notebook](https://legacycodehq.github.io/dxn/).
CI publishes the notebook from `main` only after the entire quality job passes.
Pull requests build it without publishing. GitHub Pages must have **GitHub
Actions** selected as its publishing source in the repository's Pages settings.
After the one-time setup, a push to `main` or a manual CI run publishes it.
Local development and builds use `/`. CI sets `NOTEBOOK_BASE=/dxn/` for
GitHub Pages; use that environment variable only when reproducing a Pages build.
