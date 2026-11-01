# dxn for Zed

Language support for [dxn](../../docs/language/guide.md) in Zed, powered by the
grammar in [`packages/tree-sitter-dxn`](../tree-sitter-dxn). It recognizes
`.dxn` files and gives them syntax highlighting, bracket matching, and `#`
line comments.

## Installing it for development

In Zed's Extensions view, choose **Install Dev Extension** and select this
folder. Zed builds the grammar from the commit that `extension.toml` pins, in
the repository it names, so that commit must be pushed to
`LegacyCodeHQ/dxn` and the repository readable by Zed.

## Checking it

```bash
make zed
```

It checks that the commit `extension.toml` pins has the grammar that is in
`packages/tree-sitter-dxn`, that `test/highlight.dxn`, which uses every
construct of the language, parses without errors, and that every query in
`languages/dxn` compiles against the grammar. `make check` runs it too.

When the grammar changes, commit it, then set `commit` in `extension.toml` to
that commit, and update `languages/dxn/highlights.scm` from the grammar's
`queries/highlights.scm` where its nodes changed.
