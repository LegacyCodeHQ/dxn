# dxn for Zed

Language support for [dxn](../../docs/language/guide.md) in Zed, powered by the
grammar in [`packages/tree-sitter-dxn`](../tree-sitter-dxn). It recognizes
`.dxn` files and gives them syntax highlighting, bracket matching, an outline, `#` line
comments, and inline errors from the language server in
[`packages/language-server`](../language-server).

## Installing it for development

In Zed's Extensions view, choose **Install Dev Extension** and select this
folder. Zed builds the grammar from the commit that `extension.toml` pins, in
the repository it names, so that commit must be pushed to
`LegacyCodeHQ/dxn` and the repository readable by Zed.

## The language server

The extension starts `dxn-language-server`: the one Zed's settings name, or
else the one on the project's `PATH`. To use the one in this repository, build
it with `make build`, then point Zed's settings at it:

```json
{
  "lsp": {
    "dxn-language-server": {
      "binary": {
        "path": "node",
        "arguments": ["/path/to/dxn/packages/language-server/dist/main.js"]
      }
    }
  }
}
```

Zed shows each problem `dxn check` finds under the word it is at, as you type.

## Colouring by what each name is

The grammar colours a name by how it is written, so a few are coloured by
guesswork: in `{ expanded = menu }`, `menu` is a state, not a value. The
language server knows what each name is, and says so with semantic tokens,
but Zed only uses them when its settings turn them on, for dxn alone:

```json
{
  "languages": {
    "dxn": { "semantic_tokens": "combined" }
  }
}
```

`combined` keeps the grammar's colours and lays the server's over them. The
server names its tokens with the protocol's standard types, which Zed's
themes already colour, so the extension needs no rules of its own. After
changing the setting, run `editor: restart language server`.

## How much of each element has evidence

After each element of the file's trees, the language server shows how many of
its combinations have evidence, a record at a time, as `dxn status` counts
them: `PenEvidence 4 of 6, 1 stale` after `type Button {`. Hovering over the
element's name lists the combinations still missing, stale or gone. A record
whose stored records have problems, such as a value renamed by hand, is not
counted: its hint says how many of its records have problems, of how many,
and what most of them have, such as `PenEvidence: 3 of 6 records still say
style = plain, which Style no longer has (primary, secondary)`, and the hover lists each problem,
as `dxn validate` prints it. It shows
as an inlay hint, which Zed only shows when its settings turn them on:

```json
{
  "inlay_hints": { "enabled": true }
}
```

The count follows the stored records and the designs they point at as they
change on disk.

## Formatting

A `.dxn` file is formatted the one way `dxn fmt` writes it, by the language
server: **editor: format** formats it at any time. To format it when it is
saved too, turn on Zed's format-on-save for `.dxn` files in Zed's settings;
Zed 1.26 does not, by default:

```json
{
  "languages": {
    "dxn": { "format_on_save": "on" }
  }
}
```

## Running a type or an expectation

Each type has a run button beside its name, which runs `dxn states` for it in
Zed's terminal: the table of the states it has in each combination. A type
inside another runs by its full name, `<Type>.<Name>`. The same button offers
`dxn review` for the file: it writes the pages to review the file's evidence
by, in dxn's cache, and opens each in Zed with the `zed` command, which Zed
installs with **cli: install**; **markdown: open preview to the side** then
shows its pictures. Each expectation has
one beside its title, which runs `dxn check --expect` for it: it says the
expectation holds, or why it fails, and the button shows which. The button runs the
`dxn` on the project's `PATH`; to use the one in this repository, build it with
`make build` and link it with `npm link --workspace packages/cli`.

`runnables.scm` puts the buttons on the types' names, and `tasks.json` holds
the tasks they run. `task: rerun` runs the last one again after an edit.

## Checking it

```bash
make zed
```

It checks that the commit `extension.toml` pins has the grammar that is in
`packages/tree-sitter-dxn`, that `test/highlight.dxn`, which uses every
construct of the language, parses without errors, and that every query in
`languages/dxn` compiles against the grammar. It also formats, lints, tests
and builds the Rust part in `src/lib.rs`, which needs the `wasm32-wasip2`
target (`rustup target add wasm32-wasip2`). `make check` runs it too.

When the grammar changes, commit it, then set `commit` in `extension.toml` to
that commit, and update `languages/dxn/highlights.scm` from the grammar's
`queries/highlights.scm` where its nodes changed.
