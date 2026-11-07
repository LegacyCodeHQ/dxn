# DXN — Lean-backed redesign

This worktree targets the redesigned language exclusively. Its specification is
in `lean/`; its shared TypeScript implementation is in `packages/next`.
The CLI, formatter, language server, Tree-sitter grammar and editor extensions
in this worktree support that implementation.

The current supported constructs are enumerations, types and records:

```dxn
enum Light { off, on }
enum Power {
  standby,
  no-keyboard,
  01
}

type Lamp { varies Light, Power }
type Logo { }
record Shot { light: Light }
record Review {
  shot: Shot
  power: Power
}
```

Enumeration names start with an ASCII capital letter and contain only ASCII
letters and digits. Values use ASCII lowercase letters and digits, with single
hyphens between them. Empty enums, duplicate members and duplicate declaration names
are checker errors. Missing separators and trailing commas are syntax errors.
Keywords can be member names. Enum values carry their enumeration's identity.

Types list the enumerations they vary over, including forward references. Each
type has their Cartesian product of values; a type with no factors has one empty
combination. A type name follows the enumeration naming rule. Missing or repeated
factors are checker errors.

Records are named groups of typed fields, one per line without commas. Fields
hold enum values or nested records, with forward references allowed. Empty
records, invalid or duplicate field names, unknown field types and direct or
indirect self-containment are errors R1–R6. The shared runtime enumerates their
finite values on explicit request and compares nested values by field name,
independent of field order, retaining enum identity at the leaves.

States, documentation and ordinary comments, executable evaluation and stored
facts have not been specified and implemented in this redesign yet. Their
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
node packages/cli/dist/main.js combinations examples/redesign/types.dxn
node packages/cli/dist/main.js combinations examples/redesign/types.dxn Lamp --json
```

`fmt` prints canonical one-line declarations with spaces and a final newline. It never
formats malformed syntax; semantic errors do not prevent formatting.
`--write` writes the file, and `--check` exits 1 when formatting differs.
`rename` changes an enum, type or record declaration and every reference to it,
including `varies` lists and record field types,
preserving other text. A new name cannot collide with any declaration. By default it
writes the result; `--dry-run` previews it. All rename refusals come from the
shared implementation. Renaming fields and enum values is deferred until something refers to them.

`combinations <file> [Type]` lists all types or one selected type. Text output is
one table per type; `--json` returns rows keyed by enumeration name. Invalid files
report the same diagnostics as `check` and exit 1. An unknown type lists available
types and exits 2. A type varying over nothing has one empty combination.

Commands exit 0 on success, 1 on a language/format/refactoring failure, and 2 on
invalid arguments or I/O failure. `--json` emits structured results on stdout;
text diagnostics go to stderr.

## Editors

The server supplies diagnostics, formatting, hover, enum/member/type/record/field outline,
semantic highlighting, declaration and reference navigation, declaration rename and safe naming
quick fixes. Each valid type also has a clickable combination-count code lens.
Counts use exact integer arithmetic without enumerating the product. Clicking
recomputes the table from the current unsaved buffer. VS Code opens a plaintext
document; Zed and other LSP clients display the same table in an information
message. Invalid files show no counts and stale activations refuse to list rows.
The server reads unsaved buffers and returns versioned edits. Unsupported prototype features
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

In each development editor, open `examples/redesign/enums.dxn` and
`examples/redesign/types.dxn` and `examples/redesign/records.dxn` and check:

- Records show field names and their types in hover, outline and highlighting.
  Definition/references find nested record declarations. Rename `Decision` to
  `Finding` and verify every record field type follows, while field names stay.
- Creating a record cycle reports R6 with the fields that lead back. A field
  typed as `Button` reports R5 explaining that it names a type.
- Above each type, check its combination count. Click to view the same table as
  `dxn combinations`; unsaved edits must affect the displayed rows. Introducing a
  syntax or checker error anywhere in the file must remove all counts.
- In Zed, enable `code_lens: "on"` if code lenses are disabled; the table appears
  in an LSP information message. VS Code opens a plaintext document.
- Use `type Menu { varies Lamp }` to check that T2 explains that `Lamp` is a type.
- Hover and outline show types and their factors. Definition on `Light` in
  `varies` navigates to its enum; references include each factor occurrence.
- Renaming `Light` from its declaration or a factor updates both. Renaming it to
  `Lamp` is refused because a type already has that name.
- Valid enums and types have no diagnostics; the old `enum Light = off | on` is rejected.
- `enum`, `on` and `type` inside braces are enum members, not keywords.
- Hover and outline identify each enumeration and member correctly.
- Formatting produces the same result as the CLI, including unsaved edits.
- In the enum-only example, rename `Light` to `Lamp`; only its name changes. A collision with `Power`
  is refused. Renaming to the same name makes no edits.
- Duplicate members and bad names have diagnostics at the correct spans.
- Naming quick fixes replace only the selected name. A conflicting replacement
  offers no action; an action from older text must not edit a newer buffer.
- Editing incomplete syntax does not crash the server; repairing it clears errors.

Automated grammar, protocol and bundle checks do not establish these human checks.

## Models

The change-propagation models in `docs/architecture/` intentionally remain in the
old DXN syntax. Inspect them using the separately built prototype CLI until the
new language supports their remaining constructs, including `has` and states. They are not examples accepted by this CLI.

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
