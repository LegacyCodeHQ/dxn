# dxn for VS Code

Language support for [dxn](../../docs/language/guide.md) in VS Code. It
recognizes `.dxn` files and gives them syntax highlighting, bracket matching
and `#` line comments, and through the language server, inline errors, go to
definition, find usages, hover, completion, rename and the outline. Above
each type, a code lens runs its states, and above each expectation, one runs
it alone.

## The language server

The server is attached to JSON files as well as to `.dxn` files, so it reads a
stored record's file as the editor has it, unsaved changes and all: its
problems, the counts and a rename all see what is typed before it is saved.
It says nothing of a JSON file itself.

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

## How much of each element has evidence

After each type, and each part placed in a type, an inlay hint shows how many of its
combinations have evidence, a record at a time, as `dxn status` counts them, and how
many of its stored records need a look, by what: `◌ PenEvidence 4/6 recorded · 1 stale` after `type Button {`. The hint is short; hovering over it, or over the
element's name, says all of it: the combinations still missing, stale or gone; for
records made before the element gained a state or a dimension, `· 9 outdated`, what
was added, why that matters and what to do; and for stored records set apart for
their problems, `· 3 set apart`, how many of how many and what most of them have, such
as `3 of 6 stored records say style = plain, which Style does not have (primary,
secondary)`, with each problem as `dxn validate` prints it. The count follows the
stored records and the designs they point at as they change, unsaved or on disk.


Each count starts with a mark: `●` every combination has evidence, `◐` some do, `○`
none does, and `◌` something needs a decision: a drawing stale or gone, a
record outdated, or records with problems.

A `has` line whose child is a component, such as the tabs of a tab bar, has
no hint of its own: the component's own line counts its combinations. Hovering
over the component's name on that line shows its declaration, with its
count there.
## Documentation comment styling

The extension enables semantic highlighting for dxn and supplies defaults for
three documentation token types. Markers, descriptions and continuation text use
the theme's documentation colour in italics; tags including `@` use the muted
documentation-tag palette in italics; target names use normal foreground in bold italics. The
TextMate grammar also separates these parts when semantic tokens are unavailable.
Ordinary `#` comments keep their existing style. Theme/user overrides can still
customize the defaults. Rebuild and reload the development extension after
changing its manifest or grammar.

## Documentation hovers

Attached `##` documentation appears in enum and type hovers. Enum values show
their qualified name and only their matching `@value` description. States show
their own signature and matching `@state` description. Without a matching tag,
prose applies to a state only when its declaration contains exactly one state.
Explicit tags take precedence, even when empty. Continuations are retained;
group and enum prose are not inherited by individual members. Hovers use the current unsaved buffer. Type documentation stays
visible alongside evidence details. Ordinary comments and detached documentation
do not supply documentation for these constructs.

## Formatting

A `.dxn` file is formatted when it is saved, the one way `dxn fmt` writes it:
the extension makes itself the formatter for `.dxn` files and turns on
format-on-save for them, settings a user can still change. **Format
Document** formats one at any time.

## Running a type or an expectation

"Run states" above a type runs `dxn states` for it, by its full name; "Run"
above an expectation runs `dxn check --expect` for it. Each runs as a task, in
the terminal panel, with the `dxn` command the extension bundles in
`dist/dxn.mjs`, run with VS Code's own Node: it need not be installed.

## Trying it

Build it with `make build`, which bundles the extension and the server into
`dist/`, then open a folder of `.dxn` files, such as the
[settings example](../../examples/settings), with this extension loaded for
development. A folder, not a single file: VS Code then tells the server when
stored records change on disk, as a rename makes them.

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

For the documentation-comment feature, use the shared
[editor verification project](../../examples/documentation/README.md). It includes
expected observations for hovers, diagnostics, unsaved edits, formatting and
direct syntax integration. Human results remain unverified until recorded.
