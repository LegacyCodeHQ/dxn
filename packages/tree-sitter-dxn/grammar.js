/** The syntax contract in notebook/reference/{enumerations,types,records}.md. */
/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
module.exports = grammar({
  name: "dxn",
  extras: () => [/[ \t\f\v\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/],
  word: ($) => $.identifier,
  rules: {
    source_file: ($) =>
      repeat(choice($.enum_declaration, $.type_declaration, $.record_declaration, $._newline)),
    _newline: () => /\r\n|[\r\n\u2028\u2029]/,
    enum_declaration: ($) =>
      seq(
        "enum",
        repeat($._newline),
        field("name", alias($.identifier, $.type_name)),
        repeat($._newline),
        "{",
        repeat($._newline),
        optional(
          seq(
            field("value", alias($.identifier, $.value)),
            repeat($._newline),
            repeat(
              seq(
                ",",
                repeat($._newline),
                field("value", alias($.identifier, $.value)),
                repeat($._newline),
              ),
            ),
          ),
        ),
        "}",
      ),
    type_declaration: ($) =>
      seq(
        "type",
        repeat($._newline),
        field("name", alias($.identifier, $.type_name)),
        repeat($._newline),
        "{",
        repeat($._newline),
        optional(
          seq(
            "varies",
            repeat($._newline),
            field("varies", alias($.identifier, $.type_name)),
            repeat($._newline),
            repeat(
              seq(
                ",",
                repeat($._newline),
                field("varies", alias($.identifier, $.type_name)),
                repeat($._newline),
              ),
            ),
          ),
        ),
        "}",
      ),
    record_declaration: ($) =>
      seq(
        "record",
        repeat($._newline),
        field("name", alias($.identifier, $.type_name)),
        repeat($._newline),
        "{",
        repeat($._newline),
        optional(
          seq($.record_field, repeat(seq(repeat1($._newline), $.record_field)), repeat($._newline)),
        ),
        "}",
      ),
    record_field: ($) =>
      seq(
        field("name", alias($.identifier, $.field_name)),
        ":",
        field("type", alias($.identifier, $.type_name)),
      ),
    identifier: () => /[\p{L}\p{N}_-]+/u,
  },
});
