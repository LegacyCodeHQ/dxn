# dxn: design notes

These notes keep the decisions behind dxn that the guide does not spell out,
and the questions still open. The language itself, as it is today, is in
[guide.md](guide.md).

## Goals

- Keep the specification, the design and the code in step, with assertions
  the language checks.
- Be **typed**: every mistake is reported where it is made, with what to write
  instead.
- Keep every enumerated part **finite**, so combinations can be counted
  exactly and rules checked exhaustively.
- Have a domain-free **core**, with **kits** that give it the words of a
  domain: a UI kit, and later others.

## Approach

Start from the domain, not the syntax: take one modeled element, list
everything that must be said about it, and derive the primitives that say it.
One concept at a time, each settled before the next, each with a real case
from neo-website's toolbar behind it.

## Core and kits

The core is domain-free: types, states, dimensions, rules, children, records
and expectations describe any system whose states can be listed, not only a
user interface. A kit gives the core the words of a domain, without adding
anything the core could not say.

| Core        | Meaning                                | UI kit word | Another domain   |
| ----------- | -------------------------------------- | ----------- | ---------------- |
| `type`      | what an element is: its states         | component   | step, entity     |
| `has`       | an element inside another              | child       | part             |
| (none)      | a type that nothing contains           | page        | process          |
| `dimension` | what the world around it varies by     | breakpoint  | region, plan     |
| `profile`   | a combination of the world that exists | device      | customer, market |

## Open

- **Events in a kit.** Events are names a type declares, and focus moves by
  an action of the child that takes it, so the core gives no word a meaning
  of its own. A UI kit could declare the usual events, such as `activate` and
  `escape`, for every type to use.
- **Provided state, checked by `dxn check`.** A receiving type placed where
  nothing provides its state is found only when its path is evaluated.
- **Conditions checked against the matrix.** A condition is judged over all
  values of what it compares, not over the combinations the type really has,
  so a value that can never exist through other rules is not reported.
- **Evidence for a type across pages,** and evidence that contradicts what
  `alike` says.
- **A runtime** that drives the running system into each combination and
  records what it shows.
- **Kits**: how a kit declares its words, its events and its built-in enums.
