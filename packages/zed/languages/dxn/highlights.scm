; Highlights for Zed, from packages/tree-sitter-dxn/queries/highlights.scm,
; with captures named as Zed's themes name them.

; Keywords

[
  "enum"
  "dimension"
  "type"
  "needs"
  "receives"
  "state"
  "has"
  "provides"
  "event"
  "action"
  "on"
  "alike"
  "environment"
  "profile"
  "modifier"
  "record"
  "actor"
  "records"
  "expect"
  "below"
  "then"
  "some"
  "only"
  "when"
  "in"
] @keyword


(absent_clause) @keyword

[
  "and"
  "or"
] @keyword

; Operators and punctuation

[
  "="
  "->"
  "|"
  "+"
  "x"
] @operator

[
  "{"
  "}"
  "("
  ")"
  "["
  "]"
] @punctuation.bracket

[
  ","
  ":"
  "."
] @punctuation.delimiter

; Declarations of sets of possibilities: capitalized names

(enum_declaration name: (identifier) @type)
(dimension_declaration name: (identifier) @type)
(type_declaration name: (identifier) @type)
(environment_declaration name: (identifier) @type)
(record_declaration name: (identifier) @type)

; Uses of them

(needs (identifier) @type)
(environment_declaration (identifier) @type)
(state_field type: (identifier) @type)
(state_field type: (qualified_name (identifier) @type))
(child_declaration type: (identifier) @type)
(child_declaration type: (qualified_name (identifier) @type))
(list type: (identifier) @type)
(list type: (qualified_name (identifier) @type))
(member type: (identifier) @type)
(member type: (qualified_name (identifier) @type))
(record_field type: (identifier) @type)
(record_field type: (qualified_name (identifier) @type))
(profile_declaration environment: (identifier) @type)
(assignment dimension: (identifier) @type)

; Where an expectation is: a type, then the children down to it.

(in_clause path: (identifier) @type)
(in_clause path: (qualified_name (identifier) @property))
(in_clause path: (qualified_name . (identifier) @type))

; States, children and fields

(state_field name: (identifier) @property)
(record_field name: (identifier) @property)
(child_declaration name: (identifier) @property)
(member tag: (identifier) @property)
(rule state: (identifier) @property)
(provides_declaration state: (identifier) @property)
(action_declaration state: (identifier) @property)
(state_change state: (identifier) @property)
(binding state: (identifier) @property)
(binding from: (identifier) @property)

; A condition, a when or an alike is on a dimension (capitalized) or a state.

((comparison subject: (identifier) @type)
  (#match? @type "^[A-Z]"))
((comparison subject: (identifier) @property)
  (#match? @property "^[a-z]"))
((when_expression subject: (identifier) @type)
  (#match? @type "^[A-Z]"))
((when_expression subject: (identifier) @property)
  (#match? @property "^[a-z]"))
((alike_declaration subject: (identifier) @type)
  (#match? @type "^[A-Z]"))
((alike_declaration subject: (identifier) @property)
  (#match? @property "^[a-z]"))

; What an expectation sets or expects is a dimension (capitalized) or a state.
; The profile key is its own word, and keeps its colour.

((pair key: (identifier) @type)
  (#match? @type "^[A-Z]"))
((pair key: (identifier) @property)
  (#match? @property "^[a-z]")
  (#not-eq? @property "profile"))
(pair key: (qualified_name (identifier) @property))

; Actions and events

(action_declaration name: (identifier) @function)
(action_call (identifier) @function)
(action_call (qualified_name (identifier) @function .))
(event_declaration name: (identifier) @label)
(trigger event: (identifier) @label)
(trigger event: (qualified_name (identifier) @label .))
(on_clause event: (identifier) @label)

; Profiles and modifiers

(profile_declaration name: (identifier) @type)
(modifier_declaration name: (identifier) @type)
(modifier_declaration profile: (identifier) @type)

; Values

(value) @constant

; The else of a when, a branch for every value the others do not list,
; which comes after values, so that it is a keyword and not a value.

(when_branch . (value) @keyword (#eq? @keyword "else"))

; A profile an expectation names, on its own or with its modifiers, which
; comes after values, so that each is a profile's or a modifier's, not a
; value's.

(pair
  key: (identifier) @_key
  value: (value) @type
  (#eq? @_key "profile"))
(pair
  key: (identifier) @_key
  value: (profile_combination (value) @type)
  (#eq? @_key "profile"))

; Actors, and the record each records

(actor_declaration name: (identifier) @type)
(actor_declaration record: (identifier) @type)

; Literals

(string) @string
(comment) @comment

; Structured documentation, including its tag names.
(documentation) @comment.doc
(documentation_tag name: (identifier) @hint)
(documentation_tag target: (identifier) @primary)
