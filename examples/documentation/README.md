# Documentation comments: editor verification

This project exercises the documentation feature in VS Code and Zed.
[documentation.dxn](documentation.dxn) is valid and already formatted. The
`Review` record enables evidence details in type hovers; there are no stored
records. It is part of the demonstration, not a verification result.

Human verification is **unverified** in both editors. Automated server, bundle
and grammar tests cannot establish that these editor interactions work.

## Build and open

From the repository root, run `make build`. Use the current development extension
and server, rather than an installed release:

- VS Code: follow [development setup](../../packages/vscode/README.md#trying-it),
  opening this folder with `packages/vscode` as the development extension.
  The extension bundles the newly built server.
- Zed: follow [development setup](../../packages/zed/README.md#installing-it-for-development)
  and [server configuration](../../packages/zed/README.md#the-language-server).
  Point the server at this checkout's `packages/language-server/dist/main.js`.
  Restart the language server after rebuilding it.

Open `documentation.dxn`. Confirm the language is dxn and the server starts
without an error. Run each check below in each editor. Make temporary edits in
the buffer and undo them before the next check. Disable automatic saving for the
unsaved-buffer checks. Leave personal editor settings outside this exercise.

## Language-client checks

These observations cover `VerifyVSCodeClient` and `VerifyZedClient` in the
[change-propagation model](../../docs/architecture/dxn-codebase.dxn).

| Check                       | Action                                                                                   | Expected observation                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Baseline                    | Open the unchanged file.                                                                 | No diagnostics.                                                                                                          |
| Enum documentation          | Hover `Mode` in `state mode: Mode`.                                                      | `Interaction modes.` appears with the enum summary.                                                                      |
| Value documentation         | Hover `off` in `enum Mode`.                                                              | General prose, `No interaction.` and `The control ignores input.` appear; the description of `on` does not.              |
| Type and evidence           | Hover the `Button` declaration.                                                          | `A documented button.` remains visible alongside `Review` evidence details.                                              |
| Shared state group          | Hover `focus`, then `secondary` in their declaration.                                    | Both show `Focus states.`; each shows only its own matching tag description.                                             |
| Nested declarations         | Hover the nested `Icon` declaration and its `mode` state.                                | `A nested icon.` and `Icon interaction.` appear at the appropriate names.                                                |
| Unsaved prose               | Change `No interaction.` to `Disabled while editing.` without saving; hover `off` again. | The new description appears. Undo restores the old description.                                                          |
| Unknown target              | Change only the first `@value off` to `@value missing`.                                  | An error marks `missing`, not the declaration or another value. Undo clears it.                                          |
| Unknown tag                 | Change only the first `@value` to `@bogus`.                                              | An error marks `bogus`. Undo clears it.                                                                                  |
| Wrong declaration           | Change `@state mode` above the outer state to `@value mode`.                             | An error says `@value` is only valid directly on an enum.                                                                |
| Duplicate description       | Add `## @value off Replacement.` immediately before `enum Mode`.                         | A warning marks the later tag. Hover `off` still shows the original description, without `Replacement.`.                 |
| Detached documentation      | Insert a blank line immediately before `enum Mode`.                                      | Its documentation is absent from the `Mode` and `off` hovers; the block remains a comment.                               |
| Ordinary comments           | In the initial block, replace every `##` marker with `#`.                                | The block supplies no enum/value documentation. No mixing error occurs.                                                  |
| Mixed markers               | In the initial block, replace just the first `##` marker with `#`.                       | An error reports mixing ordinary and documentation comments. Formatting leaves the invalid file unchanged.               |
| Incomplete tag and recovery | Replace the first tag line with `## @`.                                                  | A syntax error marks the incomplete tag. Later declarations remain available to navigation/hover. Undo clears the error. |

For formatting, undo all temporary edits, then replace the first block with the
following text (the continuation starts with a tab after `##`):

```dxn
##Interaction modes.
##    @value    off    No interaction.
##	The control ignores input.
## @value on Interaction enabled.
```

Run **Format Document** in VS Code or **editor: format** in Zed. Expect:

```dxn
## Interaction modes.
## @value off No interaction.
##   The control ignores input.
## @value on Interaction enabled.
```

Hover `off` again: its meaning must be unchanged. Format a second time: no edit.
Repeat once with a blank line between the block and `enum Mode`; formatting must
keep that blank line and leave the block detached.

## Direct extension checks

These observations cover `VerifyVSCodeExtension` and `VerifyZedExtension`,
separately from language-server behavior:

- Inspect the initial documentation and nested blocks. Prose stays comment text,
  with no highlighting leaking into the next declaration. Exact colours depend
  on the theme. Zed highlights tag names as keywords; VS Code currently treats
  the whole line as a comment.
- Inspect the outline. `Button` contains `Focus`, the state declarations and
  `Icon`; `Icon` contains its own `mode`. Documentation creates no extra symbols.
- Inside `Icon`, insert a new line before its closing brace. Check indentation
  and matching braces. Documentation must not alter the surrounding brace depth.
- Toggle a regular comment on a temporary code line, then undo. Check ordinary
  `#` comment behavior independently of explicit `##` documentation.

## Record the observations

Keep automated evidence and human observations separate. For each row below,
record the tester, date, source revision, editor/extension/server versions, checks
performed, and screenshots or notes for any failure. A partial run does not pass
all four responsibilities. A supporting automated pass is not human sign-off.

| Responsibility        | Human result | Evidence |
| --------------------- | ------------ | -------- |
| VerifyVSCodeClient    | unverified   | Not run  |
| VerifyVSCodeExtension | unverified   | Not run  |
| VerifyZedClient       | unverified   | Not run  |
| VerifyZedExtension    | unverified   | Not run  |

The human actor and its structured evidence record have not yet been added to
the DXN model. This table is a manual observation worksheet, not a new record
schema or an implementation status in the propagation tree.
