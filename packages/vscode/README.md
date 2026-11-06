# DXN redesign development extension

`make build` bundles this worktree's new-language server and CLI. Launch an
isolated VS Code Extension Development Host for this directory, with separate
user data and extensions, rather than replacing the current-language extension.

Supports enum diagnostics, formatting, hover, outline, semantic highlighting,
declaration navigation, enumeration rename and a Check code lens. Types, states,
comments and documentation are not yet supported by the new language. The
TextMate grammar colors keyword-shaped enum members according to their context.

See the root README for the pending human verification checklist.

Server overrides use `dxnRedesign.server.path` and `dxnRedesign.server.arguments`
so settings for the prototype server are not reused.
