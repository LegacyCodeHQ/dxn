# Reviewing a construct

How each construct of the language is reviewed, and which have been. A
review looks at a construct everywhere it lives, turns what it finds into
decisions, and fixes it one capability at a time. Enums were the first.

## Checklist

Copy this list for each construct and tick it off.

### 1. Map where it lives

- [ ] The guide: its prose, its rule under Grammar, and its row under Names.
- [ ] `parse.ts`, and the AST it builds in `ast.ts`.
- [ ] The checks that read it: `check.ts`, `check-types.ts` and the others.
- [ ] The formatter, `format.ts`.
- [ ] The Tree-sitter grammar, and Zed's queries in `packages/zed/languages/dxn`.
- [ ] VS Code's TextMate grammar, `packages/vscode/syntaxes/dxn.tmLanguage.json`.
- [ ] The language server, and what the CLI prints with `--json`.

### 2. Check the spec against itself

- [ ] The prose, the grammar rule and the Names row say the same thing.
- [ ] Each contradiction is written down as a decision to make.

### 3. Probe the parser

Run real inputs through `parse.ts`; do not only read the code.

- [ ] Characters: letters outside ASCII, `_`, a leading, trailing or doubled
  hyphen, a leading digit, capitals, a keyword as a name.
- [ ] Layout: lines carried on, comments and blank lines in every place,
  tabs, indentation, no newline at the end of the file.
- [ ] Line endings: `\n`, `\r\n`, `\r` alone, and a byte order mark.
- [ ] Structure: nested, declared twice, one item, many items, a piece
  missing, a piece extra, two on one line.

### 4. Judge the error messages

- [ ] Each points at the cause.
- [ ] Each names the rule broken, not part of a word.
- [ ] One mistake gives one error.
- [ ] Nothing is reported because of an earlier error.

### 5. Check recovery

- [ ] After a mistake, reading goes on at the right place, and the lines
  after it still count.
- [ ] A mistake on a line of its own, in a block over several lines, and on a
  line carried on to the next.

### 6. Check the AST

- [ ] Every part is kept, with where it starts and its length as written.
- [ ] Both still hold after names are given their full names.
- [ ] No reader of the AST has to read the source again for it.

### 7. Check what it means

- [ ] Declared twice, unknown, unused, and scope and shadowing.
- [ ] For each warning: what a misspelling or a syntax error makes it say
  that is not so.

### 8. Compare the two parsers

- [ ] The same inputs through Tree-sitter.
- [ ] Each difference fixed, or written as a snippet in
  `packages/language/test/agreement/` with why.

### 9. Check each reader

- [ ] Colours: TextMate, Tree-sitter's highlights and the semantic tokens,
  on lines carried on to and for names that are keywords.
- [ ] Outline, hover, definition, usages, rename and completion.
- [ ] The formatter keeps comments, indents lines carried on to, and changes
  nothing the second time.
- [ ] The language server's ranges, with each line ending.
- [ ] `--json` does not show what is internal.
- [ ] dxn and an editor agree: each rule is in `packages/language`, not in
  the CLI or the language server alone, and its scenarios are in
  `packages/language-server/test/parity.test.ts`.
- [ ] Every word dxn or an editor says about it is in the guide's Words, one
  word for one thing, said by `packages/language/src/core/vocabulary.ts`; a new
  word is added there first.

### 10. Decide

- [ ] The findings in one table, each with its options and a
  recommendation, decided one at a time.
- [ ] Each decision recorded in `design.md`.

### 11. Fix

- [ ] One capability per commit, each with a failing test first.
- [ ] The guide's prose, Grammar, Names and Diagnostics changed in the same
  commit as the behaviour.
- [ ] Its snippets added to `packages/language/test/agreement/`.

## Constructs

Every construct in the guide's Grammar, and what is shared by all of them.
"Partly" says what is left.

| Construct                                                 | Guide section                                     | Status      | Snippets    |
| --------------------------------------------------------- | ------------------------------------------------- | ----------- | ----------- |
| Enum                                                      | Enums: a named set of values                      | Reviewed    | `enums.txt` |
| Dimension                                                 | Dimensions: what the world varies by              | Partly      | —           |
| Names and words                                           | Reference: Names                                  | Partly      | —           |
| Comments and blank lines                                  | Reference: Grammar                                | Partly      | —           |
| Line endings and the byte order mark                      | —                                                 | Partly      | —           |
| Quoted strings                                            | Expectations: rules the model must follow         | Not started | —           |
| Type, with `needs` and `receives`                         | Types and states; Needs                           | Not started | —           |
| Nested declarations and full names                        | Nested declarations: what belongs to a type       | Not started | —           |
| State: listed, fixed to a value, or derived               | Types and states; When: a state the world decides | Not started | —           |
| `when` branches and `else`                                | When: a state the world decides                   | Not started | —           |
| Rule: `only when`                                         | Only when: where a state's value exists           | Not started | —           |
| Condition: `and`, `or`, brackets, `in`                    | Only when: where a state's value exists           | Not started | —           |
| `has`: a child, its bindings, `only when`                 | Has: what a type contains; Bindings               | Not started | —           |
| Lists: `[Type]` and several members                       | Lists: one or more of a type                      | Not started | —           |
| `provides` and received states                            | Provided and received: a state from far above     | Not started | —           |
| `event`                                                   | Actions and on: how a state changes               | Not started | —           |
| `action`                                                  | Actions and on: how a state changes               | Not started | —           |
| `on`: events, changes and `only when`                     | Actions and on: how a state changes               | Not started | —           |
| `alike`                                                   | Alike: what cannot be told apart                  | Not started | —           |
| Environment                                               | Environments: the shape of a device               | Not started | —           |
| Profile                                                   | Profiles: the devices that exist                  | Not started | —           |
| Modifier                                                  | Modifiers: accessories that change a profile      | Not started | —           |
| Record, its fields, scalars and derived fields            | Records: plain data                               | Not started | —           |
| Actor                                                     | Actors: who records a fact about one combination  | Not started | —           |
| Expectation: `in`, `when`, `on`, `then`, `some`, `absent` | Expectations: rules the model must follow         | Not started | —           |

What is left of those reviewed in part:

- **Dimension**: it is read by the enum's parser, so its syntax, names,
  comments and recovery were reviewed with enums. What its values do, their
  cascade down the tree, `needs` and provision, was not.
- **Names and words**: values were reviewed, and a word with `_` or a letter
  outside ASCII. The rules for every other kind of name were not.
- **Comments and blank lines**: only between an enum's values.
- **Line endings**: every editor feature, the formatter and the language
  server answer alike with `\n`, `\r\n` and `\r`. The byte order mark was not
  checked beyond the parser.

## 2026-11-04 syntax contract stage

Enums, types, states and documentation now have an agreed
[contract](syntax-contract.md). This stage covers Tree-sitter syntax, generated
sources, documentation fields, corpus/contract cases and editor highlighting.
Known differences from the handwritten parser remain explicit in the agreement
fixtures. The handwritten AST/parser, checker diagnostics, documentation hovers,
formatter and full construct checklist remain pending; this is not a completed
end-to-end construct review. Zed's distribution pin advances after the grammar
is committed.

## 2026-11-04 AST adapter stage

An internal Tree-sitter adapter covers enums, nested types, state lists, type
needs/receives, fixed/derived states and structured documentation. Native parser
tests compare compatible ASTs and analysis with the current reader, including BOM
locations; additional cases cover new values, documentation and line endings.
Unsupported constructs and recovered syntax trees fail explicitly. The public
reader has not switched: embedding, remaining constructs, error recovery, checker
rules and formatting still need migration before an end-to-end review is complete.

## 2026-11-05 shared documentation reader stage

The shared reader now retains structured documentation on enums, types and states,
including nested declarations, comma-separated states, continuation indentation
and source positions. It rejects mixed attached blocks and malformed tag syntax,
and retains documentation through declaration recovery. Tests compare lowering
with Tree-sitter across BOM and LF/CRLF/CR input; documentation agreement fixtures
and CLI/language-server parity scenarios cover the new reader behavior.

This completes the focused documentation reader step, not the whole construct
review. Semantic tag/target validation, duplicate-tag warnings, structured hovers,
formatter normalization, remaining syntax migration and human editor verification
are still pending. The shared runtime has not switched to the Tree-sitter reader.

## 2026-11-05 documentation semantic validation stage

Documentation now validates tag names, declaration kinds, required targets and
local enum/state targets in shared semantic analysis. Later duplicate tags warn
once and the analyzed AST keeps the first description; syntax retains all tags.
Tests cover source positions, nested declarations, shared state blocks, empty or
absent documentation, unused enums, CLI output and CLI/language-server parity.
Both parser entry points use these rules. Structured hover rendering, formatter
normalization, remaining syntax migration and human editor checks are still pending.

## 2026-11-05 structured documentation hover stage

Enum/type/value/state hovers now render attached AST documentation, matching
value/state tags and retaining the first duplicate description. Documented
names can show prose at their declarations. Ordinary comments are not promoted
for those constructs; legacy comments remain supported for unmigrated constructs.
Tests cover Unicode/line endings, nested scopes, state groups, unresolved enum
references, LSP Markdown/ranges, unsaved updates and coexistence with evidence.
Formatter normalization and human verification in VS Code and Zed remain pending.
