# 2. Check: does the model make sense?

```bash
dxn check spec/button.dxn
```

```
spec/button.dxn: 1 enum, 1 type
```

No problems, and one line saying what the file declares.

## What "makes sense" means

`dxn check` holds the model to what it says, the way a compiler holds a
program to its types. It checks that:

1. **Everything named exists, and is the right kind of thing.** A state's
   enum is an enum; a value is one of its enum's.
2. **Nothing contradicts itself.** No rule that can never be true, no state
   that depends on itself, no two triggers changing one state differently on
   one event.
3. **The pieces fit together.** A type only uses the dimensions it declares
   it needs; every profile gives every dimension of its device.
4. **Nothing is said twice or left half said.** Each problem is reported
   where it is, with what to write instead.
5. **The rules you wrote down hold.** Step 7 adds those.

Make two mistakes to see it work:

```
enum Enabled = enabled | disabled
enum Hover = rest | hovered

type Button {
  state enabled: Enabld
  state hover: Hover
  hover = hovered only when Pointer = mouse
}
```

```
button.dxn:5:18: unknown-enum: Enabld is not an enum (Enabled, Hover)
button.dxn:7:29: unknown-dimension: Pointer is not a dimension; the file declares none
```

Every problem has its line and column, a code for tools, and a message that
says what would do. All of them are reported at once, so they can be fixed in
one pass. A file with a problem cannot be enumerated: there is no point
listing the cases of a model that does not make sense.

## What it does not mean

A model that checks is not necessarily the right model: forget a state, and
the model still checks; it just describes a button without it. Whether it
says what you mean is yours to judge, with help from the rules of step 7.
Nor does it mean the product matches the model: that is what evidence, in
step 5, is for.

Next: [3. Enumerate](03-enumerate.md), to list the cases there are to build.
