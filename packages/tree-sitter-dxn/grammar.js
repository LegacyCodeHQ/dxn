/**
 * @file Tree-sitter grammar for the dxn language
 * @author Ragunath Jawahar <ragunath@legacycode.com>
 * @license Apache-2.0
 *
 * The authoritative parser is packages/language/src/parse.ts; this grammar
 * follows it for highlighting and tooling. Line breaks are whitespace here,
 * so it accepts some line breaks, and some missing ones, that parse.ts
 * reports (see README.md).
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/** One or more of a rule, split by a separator. */
const sep1 = (rule, separator) => seq(rule, repeat(seq(separator, rule)));

/** Values in brackets, after "in": "(<value>, ...)". */
const valuesInBrackets = ($) => seq("(", sep1($._value, ","), ")");

module.exports = grammar({
  name: "dxn",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  // In an expectation, "on escape" then "in <path>" on the next line reads
  // like the start of "on Breakpoint in (lg, xl)" until the "(".
  conflicts: ($) => [[$.comparison, $._path]],

  rules: {
    source_file: ($) => repeat($._declaration),

    _declaration: ($) =>
      choice(
        $.enum_declaration,
        $.dimension_declaration,
        $.type_declaration,
        $.environment_declaration,
        $.profile_declaration,
        $.modifier_declaration,
        $.record_declaration,
        $.expect_declaration,
      ),

    // "enum <Name> = [|] <value> | <value> ..."
    enum_declaration: ($) => seq("enum", field("name", $.identifier), "=", $._values),
    dimension_declaration: ($) => seq("dimension", field("name", $.identifier), "=", $._values),
    _values: ($) => seq(optional("|"), sep1($._value, "|")),

    // "type <Name> [needs ...] [receives ...] { ... }"
    type_declaration: ($) =>
      seq(
        "type",
        field("name", $.identifier),
        optional($.needs),
        optional($.receives),
        field("body", $.type_body),
      ),
    needs: ($) => seq("needs", sep1($.identifier, ",")),
    receives: ($) => seq("receives", sep1($.state_field, ",")),
    type_body: ($) => seq("{", repeat($._type_member), "}"),
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
    state_field: ($) => seq(field("name", $.identifier), ":", field("type", $._type_name)),

    // "state <field>, ...", "state <field> = when <Dimension> { ... }" or
    // "state <field> = <value>"
    state_declaration: ($) =>
      seq(
        "state",
        choice(
          sep1($.state_field, ","),
          seq($.state_field, "=", field("value", choice($._value, $.when_expression))),
        ),
      ),

    // "when <subject> { <value>, ... -> <value> ... }"
    when_expression: ($) =>
      seq("when", field("subject", $.identifier), "{", repeat($.when_branch), "}"),
    when_branch: ($) => seq(sep1($._value, ","), "->", field("result", $._value), optional(",")),

    // "<state> = <value> only when <condition>"
    rule: ($) =>
      seq(
        field("state", $.identifier),
        "=",
        field("value", $._value),
        "only",
        "when",
        field("condition", $._condition),
      ),

    // Comparisons joined by "and" or by "or", mixed only in brackets.
    _condition: ($) => choice($._term, $.and_condition, $.or_condition),
    and_condition: ($) => seq($._term, repeat1(seq("and", $._term))),
    or_condition: ($) => seq($._term, repeat1(seq("or", $._term))),
    _term: ($) => choice($.comparison, seq("(", $._condition, ")")),
    // "<name> = <value>" or "<name> in (<value>, ...)"
    comparison: ($) =>
      seq(
        field("subject", $.identifier),
        choice(seq("=", $._value), seq("in", valuesInBrackets($))),
      ),

    // "has <child>: <Type> [{ <bindings> }] [only when <condition>]"
    child_declaration: ($) =>
      seq(
        "has",
        field("name", $.identifier),
        ":",
        field("type", $._type_name),
        optional(field("bindings", $.bindings)),
        optional(seq("only", "when", field("condition", $._condition))),
      ),
    bindings: ($) => seq("{", repeat(seq($.binding, optional(","))), "}"),
    binding: ($) =>
      seq(
        field("state", $.identifier),
        "=",
        field("from", choice($.identifier, $.when_expression)),
      ),

    provides_declaration: ($) => seq("provides", field("state", $.identifier)),

    event_declaration: ($) => seq("event", sep1(field("name", $.identifier), ",")),

    // "action <name>: <state> <value> -> <value>"
    action_declaration: ($) =>
      seq(
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
      seq(
        "on",
        field("event", $._event),
        ":",
        sep1(choice($.action_call, $.state_change), ","),
        optional(seq("only", "when", field("condition", $._condition))),
      ),
    // An event the type or a child declares, or a change of a dimension.
    _event: ($) => choice($._path, $.comparison),
    action_call: ($) => $._path,
    state_change: ($) => seq(field("state", $.identifier), "->", field("to", $._value)),

    // "alike <subject> [in (<value>, ...)] [when <condition>]"
    alike_declaration: ($) =>
      seq(
        "alike",
        field("subject", $.identifier),
        optional(seq("in", valuesInBrackets($))),
        optional(seq("when", field("condition", $._condition))),
      ),

    // "environment <Name> = <Dimension> x <Dimension> ..."
    environment_declaration: ($) =>
      seq("environment", field("name", $.identifier), "=", sep1($.identifier, "x")),

    // "profile <name>: <Environment> { <Dimension> = <value>, ... }"
    profile_declaration: ($) =>
      seq(
        "profile",
        field("name", $.identifier),
        ":",
        field("environment", $.identifier),
        $._assignments,
      ),

    // "modifier <name> on <profile>, ... { <Dimension> = <value>, ... }"
    modifier_declaration: ($) =>
      seq(
        "modifier",
        field("name", $.identifier),
        "on",
        sep1(field("profile", $.identifier), ","),
        $._assignments,
      ),

    _assignments: ($) => seq("{", repeat(seq($.assignment, optional(","))), "}"),
    assignment: ($) => seq(field("dimension", $.identifier), "=", field("value", $._value)),

    // "record <Name> [with context] { <field>: <Type> [= when ...] ... }"
    record_declaration: ($) =>
      seq(
        "record",
        field("name", $.identifier),
        optional($.with_context),
        "{",
        repeat($.record_field),
        "}",
      ),
    with_context: (_) => seq("with", "context"),
    record_field: ($) =>
      seq(
        field("name", $.identifier),
        ":",
        field("type", $._type_name),
        optional(seq("=", field("value", $.when_expression))),
      ),

    // 'expect "<title>" { in <path> [and below]  when ...  on ...  then|some ... | absent }'
    expect_declaration: ($) =>
      seq("expect", field("title", $.string), "{", repeat($._expect_clause), "}"),
    _expect_clause: ($) =>
      choice(
        $.in_clause,
        $.when_clause,
        $.on_clause,
        $.then_clause,
        $.some_clause,
        $.absent_clause,
      ),
    in_clause: ($) => seq("in", field("path", $._path), optional($.below)),
    below: (_) => seq("and", "below"),
    when_clause: ($) => seq("when", $._pairs),
    on_clause: ($) => seq("on", field("event", $._event)),
    then_clause: ($) => seq("then", $._pairs),
    some_clause: ($) => seq("some", $._pairs),
    absent_clause: (_) => "absent",
    _pairs: ($) => sep1($.pair, ","),
    pair: ($) =>
      seq(
        field("key", $._path),
        "=",
        field("value", choice($._value, $.qualified_name, $.profile_combination)),
      ),
    // A profile a modifier makes: "<profile>+<modifier>".
    profile_combination: ($) => seq($._value, repeat1(seq("+", $._value))),

    _type_name: ($) => choice($.identifier, $.qualified_name),
    _path: ($) => choice($.identifier, $.qualified_name),
    // "<Name>.<Name>...", or a path "<child>.<child>...".
    qualified_name: ($) => seq($.identifier, repeat1(seq(".", $.identifier))),

    _value: ($) => alias($.identifier, $.value),
    // A name or a value: a letter or a digit, then letters, digits and
    // hyphens. A word ends before an arrow, so "x->a" is "x", "->", "a".
    identifier: (_) => /[A-Za-z0-9]([A-Za-z0-9]|-+[A-Za-z0-9])*/,

    // To its closing quote, on the same line.
    string: (_) => token(seq('"', /[^"\r\n]*/, '"')),

    comment: (_) => token(seq("#", /[^\r\n]*/)),
  },
});
