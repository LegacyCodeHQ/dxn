/** The syntax contract in notebook/reference/{enumerations,types}.md. */
/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
module.exports = grammar({
  name: "dxn",
  extras: () => [/[ \t\r\n\f\v\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/],
  word: ($) => $.identifier,
  rules: {
    source_file: ($) => repeat(choice($.enum_declaration, $.type_declaration)),
    enum_declaration: ($) =>
      seq(
        "enum",
        field("name", alias($.identifier, $.type_name)),
        "{",
        optional(
          seq(
            field("value", alias($.identifier, $.value)),
            repeat(seq(",", field("value", alias($.identifier, $.value)))),
          ),
        ),
        "}",
      ),
    type_declaration: ($) =>
      seq(
        "type",
        field("name", alias($.identifier, $.type_name)),
        "{",
        optional(
          seq(
            "varies",
            field("varies", alias($.identifier, $.type_name)),
            repeat(seq(",", field("varies", alias($.identifier, $.type_name)))),
          ),
        ),
        "}",
      ),
    // Deliberately wider than valid names: naming errors belong to the checker.
    identifier: () => /[\p{L}\p{N}_-]+/u,
  },
});
