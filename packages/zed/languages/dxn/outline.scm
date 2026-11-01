; The outline of a dxn file: its declarations, and inside a type, the states,
; events, children, actions, enums and types it declares; inside a record, its
; fields.

(dimension_declaration "dimension" @context name: (identifier) @name) @item
(enum_declaration "enum" @context name: (identifier) @name) @item
(type_declaration "type" @context name: (identifier) @name) @item
(environment_declaration "environment" @context name: (identifier) @name) @item
(profile_declaration "profile" @context name: (identifier) @name) @item
(modifier_declaration "modifier" @context name: (identifier) @name) @item
(record_declaration "record" @context name: (identifier) @name) @item
(actor_declaration "actor" @context name: (identifier) @name) @item
(expect_declaration "expect" @context title: (string) @name) @item

(receives "receives" @context (state_field name: (identifier) @name) @item)
(state_declaration "state" @context (state_field name: (identifier) @name) @item)
(event_declaration "event" @context name: (identifier) @name @item)
(child_declaration "has" @context name: (identifier) @name) @item
(action_declaration "action" @context name: (identifier) @name) @item

(record_field name: (identifier) @name) @item
