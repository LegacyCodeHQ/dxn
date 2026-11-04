/**
 * @file Tree-sitter grammar for the dxn language
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license Apache-2.0
 *
 * Syntax contract for enums, types, states and documentation comments.
 * The handwritten parser is migrating separately; see README.md for the
 * explicit agreement fixtures and the remaining differences.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/** One or more of a rule, split by a separator. */
// Explicit trivia keeps declaration boundaries visible to the parser.
const layout = ($, ...rules) =>
  seq(...rules.flatMap((rule, index) => (index ? [optional($._gap), rule] : [rule])));
const sep1 = ($, rule, separator) =>
  seq(
    rule,
    repeat(
      seq(
        optional(
          seq(
            separator === "|" ? $._pipe_gap : separator === "," ? $._comma_gap : $._cross_gap,
            $._gap,
          ),
        ),
        separator,
        optional($._gap),
        rule,
      ),
    ),
  );

/** Values in brackets, after "in": "(<value>, ...)". */
const valuesInBrackets = ($) => layout($, "(", sep1($, $._value, ","), ")");

module.exports = grammar({
  name: "dxn",

  extras: (_) => [/[ \t\f\v\uFEFF]/],

  // Stateless lookahead distinguishes attached ## blocks from comments.
  externals: ($) => [
    $._documentation_start,
    $._error_sentinel,
    $._comma_gap,
    $._pipe_gap,
    $._cross_gap,
  ],

  word: ($) => $.identifier,

  // In an expectation, "on escape" then "in <path>" on the next line reads
  // like the start of "on Breakpoint in (lg, xl)" until the "(".
  conflicts: ($) => [
    [$.receives],
    [$.needs],
    [$.when_branch],
    [$.member],
    [$.member, $._type_name, $.qualified_name],
    [$.pair, $.profile_combination],
    [$.qualified_name, $._value],
    [$._condition, $.and_condition, $.or_condition],
    [$.trigger],
    [$.state_change, $._path, $.qualified_name],
    [$.child_declaration],
    [$.record_field],
    [$._type_name, $.qualified_name],
    [$.in_clause],
    [$._path, $.qualified_name],
    [$.alike_declaration],
    [$.comparison, $._path, $.qualified_name],
    [$.state_declaration],
    [$._values],
    [$._gap, $._separator],
    [$.comparison, $._path],
  ],

  rules: {
    source_file: ($) =>
      seq(
        optional($._gap),
        optional(seq($._declaration, repeat(seq($._separator, $._declaration)), optional($._gap))),
      ),
    _newline: (_) => choice("\r\n", "\n", "\r"),
    _breaks: ($) => prec.right(repeat1($._newline)),
    _gap: ($) => prec.right(repeat1(choice($._newline, $.comment))),
    _separator: ($) => seq(optional($.comment), $._newline, optional($._gap)),

    _declaration: ($) =>
      choice(
        $.enum_declaration,
        $.dimension_declaration,
        $.type_declaration,
        $.environment_declaration,
        $.profile_declaration,
        $.modifier_declaration,
        $.record_declaration,
        $.actor_declaration,
        $.expect_declaration,
      ),

    // First names share the keyword's line. Newlines may continue headers;
    // comments belong at list-entry and declaration boundaries.
    enum_declaration: ($) =>
      seq(
        optional(field("documentation", $.documentation)),
        "enum",
        field("name", alias($._enum_name, $.identifier)),
        optional($._breaks),
        "=",
        optional($._gap),
        $._enum_values,
      ),
    _enum_name: (_) => /[A-Z][A-Za-z0-9]*/,
    _enum_value: (_) => /[a-z0-9]+(-[a-z0-9]+)*/,
    _enum_values: ($) => sep1($, alias($._enum_value, $.value), "|"),
    // Dimension syntax is outside this migration.
    dimension_declaration: ($) =>
      layout($, "dimension", field("name", $.identifier), "=", $._values),
    _values: ($) => layout($, optional("|"), sep1($, $._value, "|")),

    type_declaration: ($) =>
      seq(
        optional(field("documentation", $.documentation)),
        "type",
        field("name", $.identifier),
        optional($._breaks),
        optional(seq($.needs, optional($._breaks))),
        optional(seq($.receives, optional($._breaks))),
        field("body", $.type_body),
      ),
    needs: ($) =>
      seq(
        "needs",
        optional($._breaks),
        $.identifier,
        repeat(seq(optional($._breaks), ",", optional($._breaks), $.identifier)),
      ),
    receives: ($) =>
      seq(
        "receives",
        optional($._breaks),
        $.state_field,
        repeat(seq(optional($._breaks), ",", optional($._breaks), $.state_field)),
      ),
    type_body: ($) =>
      seq(
        "{",
        optional($._gap),
        optional(seq($._type_member, repeat(seq($._separator, $._type_member)))),
        optional($._gap),
        "}",
      ),
    _type_member: ($) =>
      choice(
        $.state_declaration,
        $.rule,
        $.enum_declaration,
        $.type_declaration,
        $.child_declaration,
        $.provides_declaration,
        $.event_declaration,
        $.action_declaration,
        $.trigger,
        $.alike_declaration,
      ),

    // "<state>: <Enum>"
    state_field: ($) =>
      seq(
        field("name", $.identifier),
        optional($._breaks),
        ":",
        optional($._breaks),
        field("type", $._type_name),
      ),

    // "state <field>, ...", "state <field> = when <Dimension> { ... }" or
    // "state <field> = <value>"
    state_declaration: ($) =>
      seq(
        optional(field("documentation", $.documentation)),
        "state",
        $.state_field,
        choice(
          repeat(seq(optional(seq($._comma_gap, $._gap)), ",", optional($._gap), $.state_field)),
          seq(
            optional($._breaks),
            "=",
            optional($._gap),
            field("value", choice($._value, $.when_expression)),
          ),
        ),
      ),

    // "when <subject> { <value>, ... -> <value> ... }"
    when_expression: ($) =>
      seq(
        layout($, "when", field("subject", $.identifier), "{"),
        optional($._gap),
        repeat(seq($.when_branch, optional($._gap))),
        "}",
      ),
    when_branch: ($) =>
      layout($, sep1($, $._value, ","), "->", field("result", $._value), optional(",")),

    // "<state> = <value> only when <condition>"
    rule: ($) =>
      layout(
        $,
        field("state", $.identifier),
        "=",
        field("value", $._value),
        "only",
        "when",
        field("condition", $._condition),
      ),

    // Comparisons joined by "and" or by "or", mixed only in brackets.
    _condition: ($) => choice($._term, $.and_condition, $.or_condition),
    and_condition: ($) => layout($, $._term, repeat1(layout($, "and", $._term))),
    or_condition: ($) => layout($, $._term, repeat1(layout($, "or", $._term))),
    _term: ($) => choice($.comparison, layout($, "(", $._condition, ")")),
    // "<name> = <value>" or "<name> in (<value>, ...)"
    comparison: ($) =>
      layout(
        $,
        field("subject", $.identifier),
        choice(layout($, "=", $._value), layout($, "in", valuesInBrackets($))),
      ),

    // "has <child>: <Type> [{ <bindings> }] [only when <condition>]", or a
    // list, one or more of its type: "has <child>: [<Type>] ...", or of
    // several members, a tagged union, one on each line, each with its own
    // bindings and only when: "has <child>: [ <tag>: <Type> ... ] ...".
    child_declaration: ($) =>
      layout(
        $,
        "has",
        field("name", $.identifier),
        ":",
        choice(
          layout(
            $,
            choice(field("type", $._type_name), field("list", $.list)),
            optional(field("bindings", $.bindings)),
          ),
          field("union", $.union),
        ),
        optional(layout($, "only", "when", field("condition", $._condition))),
      ),
    list: ($) => layout($, "[", field("type", $._type_name), "]"),
    union: ($) => seq("[", optional($._gap), repeat1(seq($.member, optional($._gap))), "]"),
    member: ($) =>
      layout(
        $,
        field("tag", $.identifier),
        ":",
        field("type", $._type_name),
        optional(field("bindings", $.bindings)),
        optional(layout($, "only", "when", field("condition", $._condition))),
      ),
    bindings: ($) =>
      seq("{", optional($._gap), repeat(seq($.binding, optional(","), optional($._gap))), "}"),
    binding: ($) =>
      layout(
        $,
        field("state", $.identifier),
        "=",
        field("from", choice($.identifier, $.when_expression)),
      ),

    provides_declaration: ($) => layout($, "provides", field("state", $.identifier)),

    event_declaration: ($) => layout($, "event", sep1($, field("name", $.identifier), ",")),

    // "action <name>: <state> <value> -> <value>"
    action_declaration: ($) =>
      layout(
        $,
        "action",
        field("name", $.identifier),
        ":",
        field("state", $.identifier),
        field("from", $._value),
        "->",
        field("to", $._value),
      ),

    // "on <event>: <change>, ... [only when <condition>]"
    trigger: ($) =>
      layout(
        $,
        "on",
        field("event", $._event),
        ":",
        sep1($, choice($.action_call, $.state_change), ","),
        optional(layout($, "only", "when", field("condition", $._condition))),
      ),
    // An event the type or a child declares, or a change of a dimension.
    _event: ($) => choice($._path, $.comparison),
    action_call: ($) => $._path,
    state_change: ($) => layout($, field("state", $.identifier), "->", field("to", $._value)),

    // "alike <subject> [in (<value>, ...)] [when <condition>]"
    alike_declaration: ($) =>
      layout(
        $,
        "alike",
        field("subject", $.identifier),
        optional(layout($, "in", valuesInBrackets($))),
        optional(layout($, "when", field("condition", $._condition))),
      ),

    // "environment <Name> = <Dimension> x <Dimension> ..."
    environment_declaration: ($) =>
      layout($, "environment", field("name", $.identifier), "=", sep1($, $.identifier, "x")),

    // "profile <name>: <Environment> { <Dimension> = <value>, ... }"
    profile_declaration: ($) =>
      layout(
        $,
        "profile",
        field("name", $.identifier),
        ":",
        field("environment", $.identifier),
        $._assignments,
      ),

    // "modifier <name> on <profile>, ... { <Dimension> = <value>, ... }"
    modifier_declaration: ($) =>
      layout(
        $,
        "modifier",
        field("name", $.identifier),
        "on",
        sep1($, field("profile", $.identifier), ","),
        $._assignments,
      ),

    _assignments: ($) =>
      seq("{", optional($._gap), repeat(seq($.assignment, optional(","), optional($._gap))), "}"),
    assignment: ($) => layout($, field("dimension", $.identifier), "=", field("value", $._value)),

    // "record <Name> { <field>: <Type> [= when ...] ... }"
    record_declaration: ($) =>
      seq(
        layout($, "record", field("name", $.identifier), "{"),
        optional($._gap),
        repeat(seq($.record_field, optional($._gap))),
        "}",
      ),

    // "actor <name> records <Record>": who records a record, which gives it a
    // context.
    actor_declaration: ($) =>
      layout($, "actor", field("name", $.identifier), "records", field("record", $.identifier)),
    record_field: ($) =>
      layout(
        $,
        field("name", $.identifier),
        ":",
        field("type", $._type_name),
        optional(layout($, "=", field("value", $.when_expression))),
      ),

    // 'expect "<title>" { in <path> [and below]  when ...  on ...  then|some ... | absent }'
    expect_declaration: ($) =>
      seq(
        layout($, "expect", field("title", $.string), "{"),
        optional($._gap),
        repeat(seq($._expect_clause, optional($._gap))),
        "}",
      ),
    _expect_clause: ($) =>
      choice(
        $.in_clause,
        $.when_clause,
        $.on_clause,
        $.then_clause,
        $.some_clause,
        $.absent_clause,
      ),
    in_clause: ($) => layout($, "in", field("path", $._path), optional($.below)),
    below: ($) => layout($, "and", "below"),
    when_clause: ($) => layout($, "when", $._pairs),
    on_clause: ($) => layout($, "on", field("event", $._event)),
    then_clause: ($) => layout($, "then", $._pairs),
    some_clause: ($) => layout($, "some", $._pairs),
    absent_clause: (_) => "absent",
    _pairs: ($) => sep1($, $.pair, ","),
    pair: ($) =>
      layout(
        $,
        field("key", $._path),
        "=",
        field("value", choice($._value, $.qualified_name, $.profile_combination)),
      ),
    // A profile a modifier makes: "<profile>+<modifier>".
    profile_combination: ($) => layout($, $._value, repeat1(layout($, "+", $._value))),

    _type_name: ($) => choice($.identifier, $.qualified_name),
    _path: ($) => choice($.identifier, $.qualified_name),
    // "<Name>.<Name>...", or a path "<child>.<child>...".
    qualified_name: ($) => layout($, $.identifier, repeat1(layout($, ".", $.identifier))),

    _value: ($) => alias($.identifier, $.value),
    // A name or a value: a letter or a digit, then letters, digits and
    // hyphens. A word ends before an arrow, so "x->a" is "x", "->", "a".
    identifier: (_) => /[A-Za-z0-9]([A-Za-z0-9]|-+[A-Za-z0-9])*/,

    // To its closing quote, on the same line.
    string: (_) => token(seq('"', /[^"\r\n]*/, '"')),

    // Tag validity, target resolution and duplicate-tag policy are checker work.
    documentation: ($) =>
      seq(
        $._documentation_start,
        repeat1(seq("##", optional(choice($.documentation_tag, $.documentation_text)), $._newline)),
      ),
    documentation_tag: ($) =>
      seq(
        token.immediate(prec(2, /[ \t]*@/)),
        field("name", alias(token.immediate(/[A-Za-z][A-Za-z0-9-]*/), $.identifier)),
        optional(
          seq(
            token.immediate(/[ \t]+/),
            field("target", alias(token.immediate(/[^ \t\r\n]+/), $.identifier)),
            optional(field("description", $.documentation_text)),
          ),
        ),
      ),
    documentation_text: (_) => token.immediate(/[^\r\n]+/),
    comment: (_) => token(seq("#", /[^\r\n]*/)),
  },
});
