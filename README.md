# dxn

A language for the states a thing has across every dimension it varies over:
breakpoints, pointers, themes, profiles and so on. A `.dxn` file declares
enums, dimensions, types with their states and children, environments,
profiles and records; `dxn` checks it, evaluates the states each type has in
each combination, and keeps the evidence for those combinations as JSON files
beside it.

## Example

```text
# wordmark.dxn: the wordmark's hover only exists with a mouse.
enum Hover = rest | hovered
dimension Pointer = mouse | touch
type Wordmark needs Pointer {
  state hover: Hover
  hover = hovered only when Pointer = mouse
}
environment Device = Pointer
profile laptop: Device { Pointer = mouse }
profile phone: Device { Pointer = touch }
```

```bash
$ dxn check wordmark.dxn
wordmark.dxn: 1 enum, 1 dimension, 1 type, 1 environment, 2 profiles
$ dxn states wordmark.dxn Wordmark
| profiles | Pointer | hover         |
| -------- | ------- | ------------- |
| laptop   | mouse   | rest, hovered |
| phone    | touch   | rest          |
$ dxn cases wordmark.dxn Wordmark
Wordmark: 3 cases

| Pointer | hover   |
| ------- | ------- |
| mouse   | rest    |
| mouse   | hovered |
| touch   | rest    |
```

`dxn validate`, `attach`, `status` and `rename` work on the records stored
beside a file. Every command prints a readable answer, or one JSON document
with `--json`; problems are printed as `file:line:col: code: message`. Exit
code 1 means the file has a problem or the command refused, 2 means the
command line is wrong.

- [tutorials](docs/tutorials/README.md): one button from nothing to a model
  with evidence and tests, a step at a time
- [guide.md](docs/language/guide.md): the language, one concept
  at a time, and every diagnostic code
- [commands.md](docs/commands.md): every command, with its usage
  and examples
- [tree-sitter-dxn](packages/tree-sitter-dxn/README.md): a tree-sitter grammar for dxn, for highlighting

## Development

Requires Node.js 22+, [gitleaks](https://github.com/gitleaks/gitleaks) and,
optionally, [clarity](https://github.com/LegacyCodeHQ/clarity-cli) for the
file-cycle check.

```bash
npm ci
make setup-hooks
make check
```

Run the CLI from source after building:

```bash
make build
node dist/main.js --help
```
