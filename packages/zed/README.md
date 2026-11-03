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

The server is attached to JSON files as well as to `.dxn` files, so it reads a
stored record's file as the editor has it, unsaved changes and all: its
problems, the counts and a rename all see what is typed before it is saved.
It says nothing of a JSON file itself.

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

After each type, and each part placed in a type, the language server shows how many of
its combinations have evidence, a record at a time, as `dxn status` counts
them: `◌ PenEvidence 4 of 6 combinations recorded, 1 stale` after `type Button {`. Hovering over the
element's name lists the combinations still missing, stale or gone. Records
made before the element gained a state or a dimension are counted apart, as
outdated, with what was added: `PenEvidence 0 of 15 combinations recorded · 9 outdated: hover
added`; the hover says why, what to do, and lists each. A record
whose stored records have other problems, such as a value renamed by hand, is not
counted: its hint says how many of its records have problems, of how many,
and what most of them have, such as `PenEvidence: 3 of 6 stored records say
style = plain, which Style does not have (primary, secondary)`, and the hover lists each problem,
as `dxn validate` prints it. It shows
as an inlay hint, which Zed only shows when its settings turn them on:

```json
{
  "inlay_hints": { "enabled": true }
}
```

The count follows the stored records and the designs they point at as they
change on disk.


Each count starts with a mark: `●` every combination has evidence, `◐` some do, `○`
none does, and `◌` something needs a decision: a drawing stale or gone, a
record outdated, or records with problems.

A `has` line whose child is a component, such as the tabs of a tab bar, has
no hint of its own: the component's own line counts its combinations. Hovering
over the component's name on that line shows its declaration, with its
count there.
## Indenting as you type and paste

`languages/dxn/indents.scm` tells Zed what is inside each pair of braces and
brackets, so a line typed or pasted inside a type, a record or a profile is
indented one step, and its closing `}` comes back out. A line pasted in at the
wrong depth still belongs where its braces put it, and formatting on save
indents it.

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

Each type has a run button beside its name, which offers three things to see
of it, a type inside another by its full name, `<Type>.<Name>`:

- **State matrix** runs `dxn states` for it in Zed's terminal: the table of
  the states it has in each combination.
- **Recorded evidence** runs `dxn review` for the tree it is in, and opens the
  page it writes, in dxn's cache: each combination with its status and the
  picture of what was recorded.
- **Stale evidence** does the same with `--stale`: a page of only what is
  stale or gone, each with its picture as recorded, which needs a decision.
  When nothing is, it opens no page, and the terminal says so.

The pages open in Zed with the `zed` command, which Zed installs with
**cli: install**; **markdown: open preview to the side** shows their pictures. Each expectation has
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
