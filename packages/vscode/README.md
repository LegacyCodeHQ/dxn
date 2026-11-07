# DXN redesign development extension

`make build` bundles this worktree's new-language server and CLI. Launch an
isolated VS Code Extension Development Host for this directory, with separate
user data and extensions, rather than replacing the current-language extension.

Supports enum/type/record diagnostics, formatting, hover, outline, semantic highlighting,
declaration and reference navigation, declaration rename, naming quick fixes, a Check code lens and combination-count lenses. Clicking a
count requests a fresh table from the server and opens it in a plaintext document. States,
comments and documentation are not yet supported by the new language. The
TextMate grammar colors keyword-shaped enum members and type references according to their context.

See the root README for the pending human verification checklist.

Server overrides use `dxnRedesign.server.path` and `dxnRedesign.server.arguments`
so settings for the prototype server are not reused.

Record fields have contextual TextMate and semantic highlighting. Record and type
rename use the shared declaration refactoring; field/value rename stays unavailable.
