# dxn for VS Code

Language support for [dxn](../../docs/language/guide.md) in VS Code. It
recognizes `.dxn` files and gives them syntax highlighting, bracket matching
and `#` line comments, and through the language server, inline errors, go to
definition, find usages, hover, completion, rename and the outline. Above
each type, a code lens runs its states, and above each expectation, one runs
it alone.

## The language server

The extension bundles the language server in
[`packages/language-server`](../language-server), with the language, into
`dist/server.mjs`, and runs it with VS Code's own Node: nothing else need be
installed. To run another, such as a development build, name it in VS Code's
settings:

```json
{
  "dxn.server.path": "node",
  "dxn.server.arguments": ["/path/to/dxn/packages/language-server/dist/main.js"]
}
```

## Highlighting

`syntaxes/dxn.tmLanguage.json` is a TextMate grammar, which VS Code highlights
with. It colours what Zed's queries in
[`packages/zed/languages/dxn/highlights.scm`](../zed/languages/dxn/highlights.scm)
colour, as near as the words on a line say: a TextMate grammar reads a line at
a time, without the tree Zed's grammar has.

## Running a type or an expectation

"Run states" above a type runs `dxn states` for it, by its full name; "Run"
above an expectation runs `dxn check --expect` for it. Each runs as a task, in
the terminal panel, with the `dxn` command the extension bundles in
`dist/dxn.mjs`, run with VS Code's own Node: it need not be installed.

## Trying it

Build it with `make build`, which bundles the extension and the server into
`dist/`, then open a folder of `.dxn` files, such as the
[playground](../../playground), as a folder, with this extension loaded for development. A folder, not a
single file: VS Code then tells the server when stored records change on disk,
as a rename makes them.

```bash
code --extensionDevelopmentPath=/path/to/dxn/packages/vscode /path/to/project
```

Without `code` on the `PATH`, run it from VS Code's app, at
`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code` on a
Mac.

## Checking it

`test/grammar.test.ts` tokenizes `packages/zed/test/highlight.dxn`, which uses
every construct of the language, as VS Code does, and checks each token's
scope. `test/bundle.test.ts` builds the extension, starts the bundled server
with Node, and checks a file through it, as VS Code would. `make check` runs
them.
