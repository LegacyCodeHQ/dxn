# Grammar change propagation

The model lives at [`docs/architecture/dxn-codebase.dxn`](../../docs/architecture/dxn-codebase.dxn),
alongside the workspace dependency diagrams and architecture notes.

Its current structure follows a grammar change through Tree-sitter, the core
parser, and a parser-agreement check. The first modeled behavior derives whether
parser sources need regeneration from the changed Tree-sitter artifact:

| ChangedTreeSitterInput | regenerate-tree-sitter-parser |
| ---------------------- | ----------------------------- |
| grammar                | required                      |
| scanner                | unnecessary                   |
| both                   | required                      |

`ChangedTreeSitterInput` identifies whether the grammar, external scanner, or both
changed. `TreeSitterParserRegenerationRequirement` names the enum of required or
unnecessary regeneration. `TreeSitterChange` derives its `regenerate-tree-sitter-parser` state
from that input; the root `DxnGrammarChange` declares the same dimension so it is
available to the child. Scanner-only changes do not require regenerating parser
sources, but still require rebuilding before their parsing behavior can change.
Rebuilding is not yet modeled.

This describes required work, not a recorded implementation or verification
result. Composition describes the propagation structure; it does not enforce
execution order. Implementation and verification evidence will be modeled
separately.

From the repository root, after `make build`:

```sh
node dist/main.js check docs/architecture/dxn-codebase.dxn
node dist/main.js states docs/architecture/dxn-codebase.dxn TreeSitterChange
node dist/main.js states docs/architecture/dxn-codebase.dxn DxnGrammarChange.tree-sitter-change
```

The regression test checks all three regeneration outcomes and that the model
has no diagnostics. The remaining propagation behavior can be added one
relationship at a time.
