# Start here

dxn is a language for the states a thing has and the dimensions it varies
over. This notebook records how it is designed: the mathematics each part of
the language rests on, what was decided and why, and how a Lean specification
checks that the rules hold.

It is a reference, organized by concept. Each page says what is true now; a
decision that changes is updated in place.

## How a page reads

- **Concepts** pages each explain one mathematical idea and the programming
  idea it matches, such as a finite set and an `enum`.
- Each page states every claim in plain words first. The Lean that checks it
  follows, for readers who want to see how; every argument can be followed
  without it.

## Status

| Status   | Means                                     |
| -------- | ----------------------------------------- |
| Decided  | Settled, specified in Lean and checked    |
| Deferred | An open question, with when it is decided |
