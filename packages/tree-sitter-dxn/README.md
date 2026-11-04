# tree-sitter-dxn

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for the
dxn language, with queries for syntax highlighting. Enums, types, states and
structured documentation now follow the agreed [syntax contract](../../docs/language/syntax-contract.md).
The handwritten parser in `packages/language` is migrating separately; the CLI
and language server still use it. The remaining language is described in
[the guide](../../docs/language/guide.md).

## Files

- `grammar.js`: the grammar.
- `src/parser.c`, `src/grammar.json`, `src/node-types.json`, `src/tree_sitter/`:
  committed generated output; `make grammar` fails when it is stale.
- `src/scanner.c`: handwritten stateless lookahead for declaration documentation
  and list separators across newlines/comments. It is compiled by Tree-sitter
  with the generated parser, and is excluded from the generated-output diff.
- `test/syntax-contract.test.ts`: syntax and documentation tests, including
  line endings, source text/indentation, and incremental edits.
- `queries/highlights.scm`: highlighting for keywords, declaration names,
  states, children, fields, values, strings, comments and operators.
- `test/corpus/`: the corpus tests, run by `tree-sitter test`.
- `test/guide.test.ts`: parses every dxn example in the guide, so the grammar
  and the guide cannot drift apart unnoticed.

There are no language bindings: nothing here is compiled when the workspace
is installed.

## Development

The `tree-sitter` command comes with the workspace's dev dependencies, so from
this folder:

```bash
npx tree-sitter generate    # after changing grammar.js
npx tree-sitter test        # the corpus tests
npx tree-sitter parse example.dxn
```

`make grammar`, at the root, checks that `src/` is the one `grammar.js`
generates and runs the corpus tests; `make check` and CI run it.

## Where it differs from parse.ts

Both suites read `packages/language/test/agreement/` and assert each parser's
expected result. The agreement test uses Tree-sitter's structured parse summary,
including missing tokens; it does not infer success from diagnostic text.

- Enums reject leading pipes, lowercase names, uppercase values and repeated
  hyphens. Newlines are permitted around `=` and pipes. All keywords are valid
  values. Known differences from the handwritten parser are recorded explicitly.
- Type members and top-level declarations require newlines between them. State
  commas and field colons/types can span lines; headers cannot contain comments.
- Attached `##` documentation becomes structured syntax, with tag fields and
  preserved prose indentation. Blank-line-separated or EOF-only documentation
  remains ordinary comments. Tag validity and scope/usage diagnostics are checker
  work and are not implemented by the grammar.
- An expectation's clauses can still come in any order and repeat; `in` and an
  assertion are not yet required by this grammar.
- Type/state identifiers and constructs outside this contract retain their
  existing lexical rules. No new namespace syntax is introduced.

When distributing a grammar change to Zed, commit it first and advance
`packages/zed/extension.toml` to that commit, as described in Zed's README.
