# 7. Test: rules the model must always follow

Some things must stay true however the model changes. An **expectation**
writes one down, and `dxn check` checks it against every combination, every
time. Add two to `spec/button.dxn`:

```
# The rules the button must follow, checked whenever the file is.
expect "Touch screens never show hover" {
  in Button
  when Pointer = touch
  then hover = rest
}

expect "With a mouse, an enabled button can be hovered" {
  in Button
  when Pointer = mouse, enabled = enabled
  some hover = hovered
}
```

- `in` names the element.
- `when` picks the combinations the rule is about.
- `then` says what every one of them has; `some`, what at least one has. A
  third, `absent`, says the element is not there at all.

```bash
dxn check spec/button.dxn
```

```
spec/button.dxn: 4 enums, 1 dimension, 1 type, 2 records, 2 expectations
```

Both hold. Now break the model: delete the rule
`hover = hovered only when Pointer = mouse`, as someone might while tidying up.

```
spec/button.dxn:38:8: error: expectation-failed: Touch screens never show hover: `Button` on `Pointer touch` has `hover = hovered`
```

The rule caught it, and says which combination breaks it. The model still
made sense, so step 2 alone would have passed; the expectation is what
remembered why the rule was there.

## What these tests cover

Expectations test the model: that its combinations are the ones you meant.
With `on`, they can also test behavior, such as what an event changes:

```
expect "Escape closes the menu" {
  in Page.menu
  when menu = open
  on escape
  then menu = closed
}
```

The [language guide](../language/guide.md) covers events, actions and the
rest. They do not yet test the running product: that the built button really
shows no hover on a phone. That is a runtime's job, still to come.

## And then again

That is the loop. Add a state, such as pressed or focused, and:

- `dxn check` says whether the model still makes sense, and whether its rules
  still hold;
- `dxn cases` says which cases are new;
- `dxn status` says which of them have no evidence yet, and which evidence is
  stale.

Back to the [tutorials](README.md).
