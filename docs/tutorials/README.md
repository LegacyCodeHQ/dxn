# Tutorials

These tutorials take one button from nothing to a model with evidence and
tests, one step at a time. Each step is a short document that ends where the
next begins, and every command and output in them is real.

| Step                                        | What you do                                         | Command                      |
| ------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| [1. Model](01-model.md)                     | write down what the button can be                   | (a `.dxn` file)              |
| [2. Check](02-check.md)                     | make sure the model makes sense                     | `dxn check`                  |
| [3. Enumerate](03-enumerate.md)             | list the cases there are to build                   | `dxn states`, `dxn cases`    |
| [4. Build](04-build.md)                     | draw or build each case, or have an agent do it     | (your tools)                 |
| [5. Record evidence](05-record-evidence.md) | record which frame shows each case                  | `dxn attach`, `dxn validate` |
| [6. Track](06-track.md)                     | see what has evidence, and what is missing or stale | `dxn status`                 |
| [7. Test](07-test.md)                       | write down rules the model must always follow       | `expect`, `dxn check`        |

Then the loop starts again: change the model, and steps 2 to 7 show what
changed, what is now missing, and what broke.

You need Node 22 and the `dxn` command. Every step works in an empty folder;
step 5 needs it to be a git repository, since evidence names files by their
path from the repository's root.

The [language guide](../language/guide.md) explains every part of the
language in depth; these tutorials only use what the button needs.
