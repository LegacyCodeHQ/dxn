# dxn for VS Code

Language support for [dxn](../../docs/language/guide.md) in VS Code. It
recognizes `.dxn` files and gives them syntax highlighting, bracket matching,
and `#` line comments.

## Highlighting

`syntaxes/dxn.tmLanguage.json` is a TextMate grammar, which VS Code highlights
with. It colours what Zed's queries in
[`packages/zed/languages/dxn/highlights.scm`](../zed/languages/dxn/highlights.scm)
colour, as near as the words on a line say: a TextMate grammar reads a line at
a time, without the tree Zed's grammar has.

## Trying it

Open a folder of `.dxn` files in VS Code with this extension loaded for
development:

```bash
code --extensionDevelopmentPath=/path/to/dxn/packages/vscode /path/to/project
```

Without `code` on the `PATH`, run it from VS Code's app, at
`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code` on a
Mac.

## Checking it

`test/grammar.test.ts` tokenizes `packages/zed/test/highlight.dxn`, which uses
every construct of the language, as VS Code does, and checks each token's
scope. `make check` runs it.
