# Refactoring

**Status:** Proposed

A model changes as understanding of what it models grows. In dxn, changing a
model's shape without breaking it is part of the language, not something an
editor improvises. Each refactoring is defined by the
language, specified and proved in Lean, and done by one function that the
command line and the editor both call.

## Why the language defines it

A change made by editing text, such as search and replace, changes text that
happens to match, and misses text that refers to the same thing some other
way. It cannot say whether the result means what the model meant before, or
what changed if it does not.

When the language defines a refactoring, it knows every place the change
reaches, what the model means before and after, and so what the change does to the
meaning. It can then refuse a change that would break the model, and say why,
instead of leaving a broken model behind.

## What a refactoring is

A refactoring takes a model and a request saying what to change. It gives
back either:

- **the new model**, with the edits that turn the old text into the new; or
- **every reason it is refused**, each with an ID, and nothing changed.

It is all or nothing: a refactoring is never partly done.

## The contract

Every refactoring keeps the same promises:

| #   | Promise                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------ |
| 1   | It starts only from a model the checker accepts: while any file has problems, it is refused                  |
| 2   | It is refused exactly when the result would not be accepted, and it gives every reason                       |
| 3   | When it is not refused, the new model is accepted                                                            |
| 4   | It says whether it can be undone: a reversible refactoring names its inverse; a lossy one says what it loses |
| 5   | It changes only what it must: everything else, written order included, stays as it was                       |

## Reversible and lossy refactorings

Not every refactoring can be undone, and dxn records nothing extra to make it
possible. So each refactoring is one of two kinds:

- **Reversible.** It has an _inverse_: another refactoring that, applied
  afterwards, gives back exactly the model it started from. Together they are
  the identity, and nothing needs to be recorded, since the new model still
  holds everything needed to go back. Lean proves it for each reversible
  refactoring.
- **Lossy.** No refactoring can give back the model it started from without
  information it did not keep. A lossy refactoring says exactly what it loses.

Which kind a refactoring is depends on everything that can refer to a value,
not only on its declaration. An inverse only has to give back the model when
it is applied straight away, before anything else changes.
## How each promise is kept

| What                            | How                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| The promises themselves         | Each refactoring is specified in Lean, and each promise is a theorem about it                   |
| The implementation              | The agreement checks run it and the specification on shared and generated cases, and compare    |
| The command line and the editor | Both call the same function; neither decides anything on its own                                |
| Reasons for refusing            | Each has an ID, as the checker's rules do, and a page section saying why and what to do instead |

## How it grows with the language

Refactorings are added one at a time, each with its own page, once it is
decided, specified and implemented.

As the language grows, so does each refactoring. Every new construct that
refers to something a refactoring changes must say how the refactoring
updates that reference, and the specification must prove the promises still
hold.

## Decided

| Decision                                        | Why                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Refused while any file has problems (promise 1) | A refactoring goes from one accepted model to another, never from a broken one |

## Proposed

| Decision                                                  | Why                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| The language defines each refactoring; tools only call it | One definition, so the command line and the editor never disagree   |
| All or nothing: refused with every reason, or done        | A model is never left half changed                                  |
| Each refactoring is reversible or lossy, and says which   | Not every refactoring can be undone without recording what it loses |
| Nothing is recorded to make a lossy refactoring undoable  | Recording history is complexity the language does not need          |
| Refusals have IDs, like checker rules                     | A refusal links to why, and what to do instead                      |

## Deferred

| Question                            | Decide when                                    |
| ----------------------------------- | ---------------------------------------------- |
| How evidence follows a refactoring  | Evidence is modeled                            |
| How references follow a refactoring | Something refers to what a refactoring changes |
