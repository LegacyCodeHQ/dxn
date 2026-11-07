# dxn in Lean

A specification of the dxn language in [Lean 4](https://lean-lang.org). It
says what each construct means and which declarations the checker accepts, and
Lean proves the rules hold for every declaration, not only for examples.

The new implementation, in [`packages/next`](../packages/next), follows this
specification. Where the two disagree, the specification is right and the
implementation is fixed, or the specification is changed on purpose first.

## Layout

| Path             | Holds                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `Dxn/`           | The specification: definitions, the checker, and theorems about them    |
| `DxnTest/`       | Tests: concrete cases Lean checks with `#guard` and `example`           |
| `notes/`         | One document per construct: decisions, reasons and implementation notes |
| `DxnSpec.lean`   | The specification as a program, `dxn-spec`, for the agreement checks    |
| `lakefile.toml`  | The Lake project; `DxnTest` is its test driver                          |
| `lean-toolchain` | The pinned Lean version                                                 |

| Construct               | Specification                                                                        | Tests                                                                                                | Notes                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Finite sets             | [`Dxn/FiniteSet.lean`](Dxn/FiniteSet.lean)                                           | [`DxnTest/FiniteSet.lean`](DxnTest/FiniteSet.lean)                                                   |                                                                                               |
| Names                   | [`Dxn/Name.lean`](Dxn/Name.lean)                                                     | [`DxnTest/Name.lean`](DxnTest/Name.lean)                                                             | [`notebook/reference/enumerations.md`](../notebook/reference/enumerations.md)                 |
| Enumerations            | [`Dxn/Enumeration.lean`](Dxn/Enumeration.lean)                                       | [`DxnTest/Enumeration.lean`](DxnTest/Enumeration.lean)                                               | [`notebook/reference/enumerations.md`](../notebook/reference/enumerations.md)                 |
| Types                   | [`Dxn/Type.lean`](Dxn/Type.lean)                                                     | [`DxnTest/Type.lean`](DxnTest/Type.lean)                                                             | [`notebook/reference/types.md`](../notebook/reference/types.md)                               |
| Records                 | [`Dxn/Record.lean`](Dxn/Record.lean), [`Dxn/RecordValue.lean`](Dxn/RecordValue.lean) | [`DxnTest/Record.lean`](DxnTest/Record.lean), [`DxnTest/RecordValue.lean`](DxnTest/RecordValue.lean) | [`notebook/reference/records.md`](../notebook/reference/records.md)                           |
| Files                   | [`Dxn/File.lean`](Dxn/File.lean)                                                     | [`DxnTest/File.lean`](DxnTest/File.lean)                                                             | [`notebook/reference/files.md`](../notebook/reference/files.md)                               |
| Renaming an enumeration | [`Dxn/Rename.lean`](Dxn/Rename.lean)                                                 | [`DxnTest/Rename.lean`](DxnTest/Rename.lean)                                                         | [`notebook/refactoring/rename-enumeration.md`](../notebook/refactoring/rename-enumeration.md) |

## Using it

Install Lean with [elan](https://github.com/leanprover/elan); it reads the
version from `lean-toolchain`. Then, from this directory:

```bash
lake build
```

```bash
lake test
```

or `make lean` from the repository root. Both fail if a definition does not
compile, a proof does not hold, or a test does not pass.

## Reading a construct

For each construct, read three things together:

1. **The notes** say what was decided and why, and what the specification
   leaves out: the written syntax, error messages, fix suggestions, positions.
   They also list the questions deferred to later constructs.
2. **The specification** says exactly what a declaration means and what the
   checker accepts. A `def` is a rule. A `theorem` is a property any correct
   implementation has, such as "the checker accepts exactly the valid
   declarations".
3. **The tests** are concrete cases. An implementation's tests can reuse each
   one as it is.

The specification models the parsed form of a declaration, not its text. The
grammar is specified in the notes and checked by the implementation's grammar
tests.

## Agreement with the implementation

The proofs are about the specification's own definitions; the implementation
could change while they all still hold. The agreement checks connect the two:
the same declarations go through both, and they must say the same.

`lake exe dxn-spec <file>` reads cases as JSON, each a file's declarations,
enumerations and types, and optionally an enumeration to rename in it, and
writes, for each, the problems `File.check` reports, the values and each
type's combinations of an accepted file, and the reasons a rename is refused
or the declarations it gives:

```bash
make agreement
```

builds it and runs
[`packages/next/test/agreement`](../packages/next/test/agreement): the shared
cases in `cases.json` (enumerations), `files.json`, `types.json` and `renames.json`, each
again with its values reversed, and generated enumerations, mixed files and
renames. Each goes through the implementation directly, and again as text
through its parser. They must agree on what is accepted, which problems are
reported for which names in which order, the E1–E4, T1–T3 and F1 problem IDs
and RE1–RE4 refusal IDs, which values and combinations an accepted file has,
and what each rename does or why it is refused. Messages and positions belong
to the implementation, and its own tests cover them.

This tests agreement on those cases; it does not prove the implementation.
Add a case to `cases.json` for each new rule. `make lean` and `make agreement`
are part of `make check`, so the pre-push hook and CI run both, and both need
Lean installed.

## Implementing a specification across the toolchain

Every redesigned-language change starts by reviewing this specification and its
[design notebook](../notebook/index.md). Lean defines meaning, validity and the
specified transformations. The notebook defines written syntax and implementation
guidance, including messages, formatting and corrections. Syntax is a decision,
not something inferred automatically from a semantic definition. A syntax-only
or presentation-only change can leave the Lean definitions unchanged.

The [redesign propagation model](../docs/architecture/dxn-codebase-redesign.dxn)
is the responsibility map for this workflow. It covers only `lean/`,
`packages/next` and tools for the redesigned language. It is written in prototype
DXN syntax until the redesigned language can express it; use the separately built
prototype CLI to inspect the model, not the redesigned CLI.

Review every responsibility below for each change. Review does not mean every
file must be edited. The model groups common consumers under
`ReviewLanguageToolchain`, so we review their combined upstream impact once.
Its `has` edges express review obligations, not execution order or a complete
source dependency graph. Parser and checker results both reach diagnostics,
formatting and refactoring feed both interfaces, and LSP features reach both
editors even though those consumers are not repeated under every producer.

| Responsibility                | What to review                                                                                                | Implementation and verification                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Specification and decisions   | Meaning, validity, laws, syntax, rule IDs and deferred questions                                              | `Dxn/`, `DxnTest/`, notebook; `make lean`                                         |
| Syntax contract               | Valid, invalid and incomplete examples; tokens and separators                                                 | Notebook reference and shared syntax cases                                        |
| Tree-sitter                   | Grammar, optional scanner, generated sources and parsed fields                                                | `packages/tree-sitter-dxn`; `make grammar` and parser agreement                   |
| Core parser                   | Manually implemented reading, parsed declarations, spans, syntax errors and stop/recovery behavior            | `packages/next/src/syntax`; parser tests and parser agreement                     |
| Semantic analyzer             | Acceptance, identity, resolution and checker errors                                                           | `packages/next/src/check` and `analysis`; `make agreement`                        |
| Parser fixes                  | Whether a safe syntax correction is specified, its scope and precise edits                                    | Review explicitly; not implemented yet                                            |
| Checker suggestions and fixes | Accepted, non-colliding candidates, exact edits and unchanged surrounding text                                | Shared analysis/editor code; naming corrections currently implemented             |
| Formatter                     | Canonical output, member order, idempotence and invalid-input behavior                                        | Shared syntax formatter; preservation tests and CLI/LSP parity                    |
| Refactoring                   | Preconditions, refusals, result, transformation laws and source edits                                         | `Dxn/Rename.lean`, shared `refactor/`; agreement and edit tests                   |
| Evaluation                    | Cartesian products and counts; executable behavior when specified                                             | Shared products and listing compared with Lean; executable behavior not specified |
| Stored records/evidence       | Validation, identity and transformations of the redesigned language's records                                 | Not implemented yet; separate from evidence for this workflow                     |
| Diagnostic contract           | Shared severity, codes, rule IDs, messages, locations and correction metadata                                 | Shared analysis; CLI text/JSON and LSP parity tests                               |
| Shared editor features        | Hover, completion, navigation, outline, semantic tokens and actions actually supported                        | Shared editor code; range and correction tests                                    |
| CLI                           | Commands, text/JSON, exit codes, reads/writes and dry runs                                                    | `packages/cli`; actual executable and parity tests                                |
| Language server               | Capabilities, current unsaved buffers, diagnostics, formatting, actions and versioned edits                   | `packages/language-server`; protocol and parity tests                             |
| VS Code                       | Direct TextMate syntax/configuration, client startup and bundled tools                                        | `packages/vscode`; grammar/bundle tests and human checks                          |
| Zed                           | Direct grammar snapshot/queries, configuration, tasks and client startup                                      | `packages/zed`; `make zed` and human checks                                       |
| Build and distribution        | Dependencies, boundaries, generated artifacts, entry points, alias rewriting, bundles and development staging | `make build`, `make smoke`, grammar and extension checks                          |

A Tree-sitter **grammar** change requires regenerating parser sources. A
**scanner-only** change does not; a semantic-only change may require neither.
The current enum grammar has no external scanner. Update the Zed development
grammar snapshot when its grammar or scanner changes. Build/staging must not
replace global installations or modify the developer's editor settings.

Parser corrections and checker corrections are different responsibilities.
Currently the core parser stops at its first syntax error; error recovery and
parser fixes must not be assumed to exist. Naming quick fixes correct invalid
source and have implementation guarantees recorded in the notebook. Semantic
rename transforms an accepted model and has Lean-defined laws. A rename proof
does not prove a naming correction or a stored-record transformation.

### Recording review and verification

For every responsibility, record one implementation review outcome in the change
summary, with its reason and affected paths:

- **Changed:** implementation was updated.
- **Reviewed, no change needed:** existing behavior handles the decision, with
  the supporting reason.
- **Not yet implemented:** the responsibility remains open. Decide explicitly
  whether that gap prevents completion of the current construct.

These outcomes are separate from verification. An implemented feature can still
be unverified; unchanged code still needs checks when affected. Record the tested
revision, command or human procedure, result and supporting evidence separately.
The model's `AutomatedVerification` record belongs to `CodingAgent`; it is not
human editor sign-off. It does not yet define a human evidence record schema,
so retain human observations separately with the same revision and evidence.
Skipped VS Code or Zed checks remain **unverified**, never implicitly passed.

Use the appropriate existing gates: `make lean`, `make agreement`, parser and
component tests, coverage, `make build`, `make smoke`, `make grammar`, `make zed`
and `make notebook`. Run `make check` before pushing. Retain the output used as
evidence. Passing Lean proofs establishes properties of the specification;
agreement tests, executable tests, protocol tests and human checks establish
different evidence and cannot substitute for one another.

## Adding to it

- Decide first, then write the notes: the decision, the reason, and what is
  deferred.
- Write a failing test in `DxnTest/`, confirm `lake test` fails, then add the
  definitions and proofs to `Dxn/` until it passes.
- Keep one construct per module, and import each new module from `Dxn.lean`
  and `DxnTest.lean`.
- Extend `dxn-spec` and the agreement checks to the new construct.
- Follow the toolchain checklist above and record each responsibility's review
  outcome and separate verification evidence.
- Use only Lean's own library; add Mathlib only when a construct needs it.
