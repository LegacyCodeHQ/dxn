; Where Zed shows a run button: on each type's name, with the name dxn states
; takes, and where dxn review writes and opens the file's review pages; and on
; each expectation's title, which dxn check --expect takes; the tasks in
; tasks.json run them.

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

; An expectation: its title, in its quotes, which dxn check --expect takes.
((expect_declaration
  title: (string) @run @title)
  (#set! tag dxn-expect))
