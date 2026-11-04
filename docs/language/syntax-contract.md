# Enum, type, state and documentation contract

These decisions were agreed on 2026-11-04. This is the target contract for the
parser migration. The Tree-sitter grammar implements the syntax portion first;
the handwritten parser, formatter, AST and checker are not yet migrated. In
particular, the existing CLI and language server do not yet interpret `##` tags
or implement the new shadowing diagnostics. Existing runtime behavior is unchanged.

## Declaration boundaries

Separate declarations require a newline, including after a closing brace.
A declaration keyword and its first name share a line. A type's opening brace
may appear on a later line; a closing brace may share its last member's line.
The grammar currently enforces these header rules for `enum`, `type` and `state`.
Other constructs retain their existing syntax, except that declarations and type
members are separated by newlines.

Newlines and blank lines are allowed at continuation positions. Comments are
allowed at declaration and list-entry boundaries, including before a type's first
member and after its last member. They cannot interrupt a type header before its
opening brace, an enum header before `=`, or a state entry between its name, colon
and type. Newlines alone may occur in those positions.

## Enums

- At least one value is required. Pipes separate every pair of values; a newline
  is not a substitute. Leading, trailing and consecutive pipes are invalid.
- Newlines may appear before and after `=` and pipes. Comments may appear after
  `=` before the first value, and between values, including after a pipe.
- Enum names match `[A-Z][A-Za-z0-9]*`. Both `Hover` and `HOVER` are valid and distinct.
- Enum values match `[a-z0-9]+(?:-[a-z0-9]+)*`. They may start with a digit or contain
  only digits. Leading, trailing and repeated hyphens are invalid. Uppercase letters
  and underscores are invalid.
- Names and values are ASCII-only and case-sensitive. Documentation, ordinary
  comments and string content may contain Unicode.
- Values are textual names. `1` and `01` are distinct, with no numeric conversion.
- Language keywords, including `when` and `else`, are valid enum values.

The lexical restrictions are syntax rules. Duplicate values are checker errors;
different enums may reuse the same values.

## Types and states

Types may contain nested enums and types, and state declarations. Multiple states
in one declaration require commas. Newlines, blank lines and ordinary comments
may appear on either side of those commas. A trailing comma is invalid.

The first name must share the `state` keyword's line. Newlines may appear between
an entry's name, colon and type, but comments cannot interrupt that entry.
Separate `state` declarations require a newline. The formatter will choose one
layout from the valid spellings; formatting preferences do not narrow the grammar.

This change retains existing type/state name rules, qualified references, fixed
and derived states, and other type members. Their broader design is not being
redefined by the enum naming contract.

## Documentation syntax and attachment

Ordinary comments start with `#`. Documentation starts with `##` and is optional.
A contiguous documentation block attaches directly to the following enum, type
or state declaration. A blank line breaks attachment. Unattached `##` lines are
ordinary comments, with no diagnostic. Mixing ordinary and documentation markers
in an attached block is a syntax error; no marker is silently promoted.

```dxn
## A clickable control.
type Button {
  ## Pointer interaction.
  ## @value rest The pointer is away.
  ## @value hovered The pointer is over the element.
  enum Hover = rest | hovered

  ## @state hover Pointer interaction.
  ##   This is a continuation of the hover description.
  ## General description of the state declaration.
  state hover: Hover
}
```

The tree has a `documentation` field on each documented declaration. Within that
node, `documentation_tag` exposes `name`, `target`, and optional `description`
fields. `documentation_text` retains whitespace, including indentation, so the
future AST adapter can distinguish a tag continuation from general description.
Unknown tags and targets, duplicate tags and tags on the wrong declaration are
syntactically recognizable; the checker must diagnose them.

The future documentation interpretation is:

- `@state` applies only directly to a `state` declaration. A type's documentation
  cannot use it to document contained states.
- `@value` applies only directly to an enum. Dimensions are deferred.
- An unknown tag, an unknown target or a tag on the wrong declaration is an error.
- A repeated tag for the same target is a warning at the later occurrence. The
  first occurrence supplies the documentation; descriptions are never combined.
- Descriptions may be empty. Indented prose continues the preceding tag's
  description; unindented prose contributes to the declaration's description.
- Missing documentation is valid and produces no diagnostic.

## Resolution and checking to implement later

Bare names resolve in the current scope first, then enclosing scopes outward.
Resolution stops at the nearest declaration. If it is the wrong kind, report an
error instead of searching further. Missing references are also checker errors.
Declarations are visible throughout their scope, including forward references.

Duplicate enum names in one scope are errors. An enum and a type cannot share a
name in the same scope. An inner enum may shadow an outer one throughout the
inner scope; the shadowed outer enum is inaccessible from there. No new root or
namespace qualifier is being introduced. Shadowing produces an informational
diagnostic at the inner enum, with the outer declaration's location.

An unused enum gets a warning; individual values do not. Documentation references
may appear in reference tooling but do not suppress unused warnings. A resolved
code reference counts as usage even if the surrounding declaration has other
checker errors.

## Verification and migration

`packages/tree-sitter-dxn/test/syntax-contract.test.ts` exercises accepted and
rejected forms with LF, CRLF and CR line endings, structured documentation fields,
and incremental attachment edits. The native corpus and existing editor queries
remain in use. Agreement fixtures record each known difference from the current
handwritten parser without changing its expected behavior.

The small stateless external scanner recognizes documentation attachment and
lookahead for separators across trivia. It does not resolve names, interpret
numeric values, or perform checker diagnostics. Its zero-width markers are
followed by grammar symbols that consume input, and it declines all tokens during
Tree-sitter's all-symbols error-recovery probe.

Detailed error-recovery policies, the AST adapter, checker changes and formatter
normalization remain later migration stages. The existing Zed grammar pin must
advance to the grammar commit when these changes are committed for distribution.
