; Where Zed shows a run button: on each type's name, with the name dxn states
; takes, which the tasks in tasks.json run.

; A type at the top of the file: its own name.
((source_file
  (type_declaration
    name: (identifier) @run @type))
  (#set! tag dxn-type))

; A type inside another: the outer type's name, and its own.
((type_declaration
  name: (identifier) @parent
  body: (type_body
    (type_declaration
      name: (identifier) @run @type)))
  (#set! tag dxn-nested-type))
