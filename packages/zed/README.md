# DXN redesign development extension

Run `make build zed-dev` at the repository root. Install `.dxn-dev/zed` as the
Zed development extension, not this template directory. The generated extension
uses a real local grammar snapshot, not the prototype's remote grammar pin.
It has extension ID `dxn-redesign`.

Set `lsp.dxn-redesign-language-server.binary.path` to Node and `binary.arguments` to this
worktree's absolute `packages/language-server/dist/main.js`. A server on PATH is
never used. No user settings or global installations are changed by the build.
The Check task expects this repository as the project root and runs its built CLI.

See the root README for supported syntax and the pending manual verification.

Naming quick fixes come from the redesigned language server and return versioned
edits for the current unsaved buffer. No extension-specific correction logic is needed.

With code lenses enabled (`"code_lens": "on"`), valid types show exact combination
counts. Clicking one invokes the server's `dxn.combinations` command, which
recomputes from the unsaved buffer and displays the canonical table in an LSP
information message. No local file or prototype CLI is used for this action.
Files with syntax or checker errors show no combination counts.

The staged grammar and queries cover records, newline-separated fields, field names
and type references. Declaration rename and record diagnostics use the same LSP
runtime as the CLI; no editor-specific semantic rules are introduced.
