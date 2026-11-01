; How Zed indents a dxn file as it is typed or pasted into: what is inside a
; pair of braces or brackets is indented one step, and the closing one comes
; back out.

(_ "{" "}" @end) @indent
(_ "(" ")" @end) @indent
