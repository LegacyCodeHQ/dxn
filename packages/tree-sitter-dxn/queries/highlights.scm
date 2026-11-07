(type_declaration ["type" "varies"] @keyword)
(enum_declaration "enum" @keyword)
(type_name) @type
(value) @constant
["{" "}"] @punctuation.bracket
"," @punctuation.delimiter
(record_declaration "record" @keyword)
(field_name) @property
":" @punctuation.delimiter
