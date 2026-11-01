# 1. Model: what the button can be

Start small: a button that is either enabled or disabled. Write it in a file
named `button.dxn`, in a folder called `spec`:

```
# A button on the website.
enum Enabled = enabled | disabled

type Button {
  state enabled: Enabled
}
```

Three things are declared:

- `#` starts a comment, for the why that the rest cannot say.
- `enum Enabled = enabled | disabled` is a closed set of values. A set of
  possibilities is capitalized; its values are lowercase.
- `type Button { … }` is the element. Its one `state`, `enabled`, takes its
  values from the enum.

That is the smallest model there is: one enum, and one type with one state of
it. Nothing about devices, hover or focus yet; each comes when the button
needs it.

The model says what the button can be, not what it looks like: no colors, no
sizes. How each case looks is decided when it is drawn or built, in step 4.

Next: [2. Check](02-check.md), to make sure the model makes sense.
