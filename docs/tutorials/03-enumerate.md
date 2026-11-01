# 3. Enumerate: the cases there are to build

Two commands answer two questions about the button.

**What can happen, on each device?**

```bash
dxn states spec/button.dxn Button
```

```
| enabled           |
| ----------------- |
| enabled, disabled |
```

One row, since nothing yet varies by device, and in it the values `enabled`
can have: both.

**Which cases are there?**

```bash
dxn cases spec/button.dxn Button
```

```
Button: 2 cases

| enabled  |
| -------- |
| enabled  |
| disabled |
```

Two cases: an enabled button and a disabled one. That list is what step 4
builds.

## Growing the model

A real button can be hovered, with a mouse but not on a touch screen, and a
disabled one shows no hover. Add the pointer, the hover, and what they mean:

```
# A button on the website.
dimension Pointer = mouse | touch

enum Enabled = enabled | disabled
enum Hover = rest | hovered

type Button needs Pointer {
  state enabled: Enabled
  state hover: Hover
  # Only a mouse can hover, and a disabled button shows no hover.
  hover = hovered only when Pointer = mouse
  alike hover in (rest, hovered) when enabled = disabled
  alike Pointer
}
```

- `dimension Pointer` is something the world around the button varies by.
  `needs Pointer` says the button depends on it.
- `hover = hovered only when Pointer = mouse` is a rule: hovered exists only
  with a mouse.
- `alike hover in (rest, hovered) when enabled = disabled` says a disabled
  button looks the same hovered or not: it can be hovered, but nothing shows.
- `alike Pointer` says the pointer itself changes nothing visible: a button at
  rest looks the same with a mouse or a finger.

Check it, then ask again:

```bash
dxn states spec/button.dxn Button
```

```
| Pointer | enabled           | hover         |
| ------- | ----------------- | ------------- |
| mouse   | enabled, disabled | rest, hovered |
| touch   | enabled, disabled | rest          |
```

```bash
dxn cases spec/button.dxn Button
```

```
Button: 3 cases of 6 combinations

| enabled  | hover         | combinations                                                                                   |
| -------- | ------------- | ---------------------------------------------------------------------------------------------- |
| enabled  | rest          | Pointer = mouse; Pointer = touch                                                               |
| enabled  | hovered       | Pointer = mouse                                                                                |
| disabled | rest, hovered | Pointer = mouse, hover = rest; Pointer = mouse, hover = hovered; Pointer = touch, hover = rest |
```

Six combinations can happen, but only three can be told apart: enabled at
rest, hovered, and disabled. Those are the three to build. The last column
says which combinations each case covers. To see all six, as if nothing were
alike:

```bash
dxn cases spec/button.dxn Button --combinations
```

```
Button: 6 combinations

| Pointer | enabled  | hover   |
| ------- | -------- | ------- |
| mouse   | enabled  | rest    |
| mouse   | enabled  | hovered |
| mouse   | disabled | rest    |
| mouse   | disabled | hovered |
| touch   | enabled  | rest    |
| touch   | disabled | rest    |
```

With `--json`, `dxn cases` prints the same as one JSON document, for an agent
to read in step 4.

Next: [4. Build](04-build.md), to draw or build each case.
