# tree-sitter-dxn

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for the
dxn language, with queries for syntax highlighting. The language is described
in [the guide](../../docs/language/guide.md); its authoritative parser is
[`packages/language/src/parse.ts`](../language/src/parse.ts), and this grammar
follows it.

## Files

- `grammar.js`: the grammar.
- `src/`: the parser `tree-sitter generate` makes from it. It is committed, as
  Tree-sitter grammars are; `make grammar` fails when it is stale.
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

The grammar is for reading a file's structure, not for checking it, so it is
more permissive than `parse.ts` in a few places:

- Line breaks are whitespace. Statements that `parse.ts` requires on lines of
  their own can share a line (`state a: A state b: B`), and a line can break
  where `parse.ts` does not allow it, such as before a `,`.
- An expectation's clauses can come in any order and repeat; `in` and an
  assertion are not required.
- Names are not checked for their case: a lowercase enum name parses.
- A state, child or value may not be named after a keyword where that keyword
  could also start the next statement, such as a rule on a state named `state`
  or `on`; `parse.ts` tells these apart by the `=` after them.
- A word cannot end with a hyphen (`a-`), which `parse.ts` accepts.
