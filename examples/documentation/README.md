# Documentation comments: editor verification

This project exercises the documentation feature in VS Code and Zed.
[documentation.dxn](documentation.dxn) is valid and already formatted. The
`Review` record enables evidence details in type hovers; there are no stored
records. It is part of the demonstration, not a verification result.

The Zed walkthrough has been exercised with the developer; see the observations
below for its scope and remaining checks. VS Code verification is unverified.
Automated server, bundle and grammar tests cannot establish editor interactions.

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
| Value documentation         | Hover `off` in `enum Mode`.                                                              | `Mode.off`, `No interaction.` and `The control ignores input.` appear; general enum prose and other values are absent.   |
| Type and evidence           | Hover the `Button` declaration.                                                          | `A documented button.` remains visible alongside `Review` evidence details.                                              |
| Shared state group          | Hover `focus`, then `secondary` in their declaration.                                    | Each shows its own state signature and matching tag description; `Focus states.` and enum prose are absent.              |
| Nested declarations         | Hover the nested `Icon` declaration and its `mode` state.                                | `A nested icon.` and `Icon interaction.` appear at the appropriate names.                                                |
| Unsaved prose               | Change `No interaction.` to `Disabled while editing.` without saving; hover `off` again. | The new description appears. Undo restores the old description.                                                          |
| Unknown target              | Change only the first `@value off` to `@value missing`.                                  | An error marks `missing`, not the declaration or another value. Undo clears it.                                          |
| Unknown tag                 | Change only the first `@value` to `@bogus`.                                              | An error marks `bogus`. Undo clears it.                                                                                  |
| Wrong declaration           | Change `@state mode` above the outer state to `@value mode`.                             | An error says `@value` is only valid directly on an enum.                                                                |
| Duplicate description       | Add `## @value off Replacement.` immediately before `enum Mode`.                         | A warning marks the later tag. Hover `off` still shows the original description, without `Replacement.`.                 |
| Detached documentation      | Insert a blank line immediately before `enum Mode`.                                      | One warning marks the first `##`; `Mode` and `off` hovers have no prose. Removing the blank line clears the warning.     |
| Ordinary comments           | In the initial block, replace every `##` marker with `#`.                                | The block supplies no enum/value documentation. No mixing error occurs.                                                  |
| Mixed markers               | In the initial block, replace just the first `##` marker with `#`.                       | An error reports mixing ordinary and documentation comments. Formatting leaves the invalid file unchanged.               |
| Incomplete tag and recovery | Replace the first tag line with `## @`.                                                  | A syntax error marks the incomplete tag. Later declarations remain available to navigation/hover. Undo clears the error. |

Hover `on` as well: `Mode.on` must appear as a plain code label, without
keyword colouring. These qualified labels identify values; they are not
standalone DXN statements.

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

## Single-state prose recheck

In the original valid source, delete line 15 (`## @state mode Whether input is
accepted.`), keeping the prose `## Current interaction mode.` above the lone
`state mode: Mode` declaration. Hover that state: expect `Current interaction
mode.`. Add `, another: Mode` to that same declaration without saving: neither
state should inherit the group prose. Remove the second state: the prose should
reappear. Restore the original file afterward. An explicit matching `@state`
continues to override general prose, including an explicitly empty tag.
The developer confirmed the prose-only single-state hover in Zed on 2026-11-06.
The full single/group/single transition and VS Code checks remain pending.

## Partially documented group recheck

With the original source restored, remove only the `@state secondary` line from
its shared declaration's documentation. The `secondary` name in `state focus:
Focus, secondary: Focus` should receive a `missing-state-documentation` warning;
`focus` remains documented. Restore the missing tag without saving: the warning
should disappear. Remove both state tags, leaving only group prose: neither state
should receive a missing-documentation warning. Restore the original file.
The developer observed the missing-sibling warning in Zed on 2026-11-06 and
confirmed it cleared when the missing tag was added. The no-tags/prose-only
exceptions have automated coverage; their manual recheck and VS Code checks
remain pending.

## Documentation-aware rename recheck

Restore the original valid source first. On line 12, rename `focused` in the
nested enum using the editor's rename action, choosing `active`. The attached
`@value focused` on line 11 must change to `@value active` as part of the same
rename, with no unknown-target error. Its description stays `Keyboard focus.`.
Undo the rename, then repeat starting on the documentation target on line 11.

Rename `focus` in the shared state declaration on line 21 to `primary`. Only its
matching `@state focus` target changes to `@state primary`; the `secondary` target
and prose stay unchanged. Undo the rename after checking. The developer confirmed these three cases in
Zed on 2026-11-06. VS Code verification remains pending.

## Direct extension checks

These observations cover `VerifyVSCodeExtension` and `VerifyZedExtension`,
separately from language-server behavior:

- Inspect the initial documentation and nested blocks. Prose stays comment text,
  with no highlighting leaking into the next declaration. Exact colours depend
  on the theme. With semantic highlighting enabled, markers, prose and continuation text are
  italic in the documentation colour; tags including `@` are italic in a
  distinct tag colour; target names use normal foreground. For medium italic targets, apply the
  [Zed medium-weight override](../../packages/zed/README.md#medium-weight-target-names);
  VS Code retains its bold italic default.
  Compare `@value on` with the `on` value declaration: neither treats the target
  as a language keyword.
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

| Responsibility        | Human result | Evidence                    |
| --------------------- | ------------ | --------------------------- |
| VerifyVSCodeClient    | unverified   | Not run                     |
| VerifyVSCodeExtension | unverified   | Not run                     |
| VerifyZedClient       | partial      | Developer walkthrough below |
| VerifyZedExtension    | partial      | Developer walkthrough below |

The human actor and its structured evidence record have not yet been added to
the DXN model. This table is a manual observation worksheet, not a new record
schema or an implementation status in the propagation tree.

### Developer observations — 2026-11-06

The developer performed these checks in Zed and supplied screenshots or explicit
confirmation in the development chat. Source was the working changes based on
`8ebdcce`, committed with this observation note. Exact Zed, font and extension
versions were not collected. Semantic highlighting was enabled in combined mode;
the developer applied the documented medium-weight override for One Dark/One
Light. Screenshots remain in the chat and are not archived in this repository.

Passed within the exercised scope:

- Muted documentation/tag colours, normal-foreground targets and medium italic
  target emphasis after applying the theme override.
- Focused enum/value/state hovers, continuation text, nested declarations and
  state-group target selection; type prose remains visible with evidence details.
- Unsaved hover updates; unknown target, unknown tag and wrong-kind tag errors;
  later duplicate warnings retain only the original description in the hover.
- Blank-line detachment removes hover prose and warns on the first marker;
  removing the blank line clears the warning and restores the hover without saving.
- Mixed-comment errors; malformed-tag errors with a later state hover still
  working while the malformed tag remains present.
- Documentation formatting preserves continuation meaning; ordinary comments
  supply no hover documentation; outline hierarchy, indentation and bracket matching.

Still pending: repeat-format idempotence, formatting refusal on invalid input,
comment toggling, exact editor/version metadata and the VS Code walkthrough.
The initial rename refusal was fixed and rechecked on 2026-11-06: renaming the
enum value updated its documentation target, renaming from that target updated
the enum, and state rename updated its matching tag without changing the other
state or prose. These were confirmed through a screenshot and developer reports
in the chat. Manual duplicate-tag and stored-evidence rename checks remain
pending; their current coverage is automated. These observations are partial
verification, not blanket sign-off for every client or direct-extension behavior.

The developer also confirmed the prose-only single-state hover and reported the
partial-group warning, then confirmed adding the missing state's tag cleared it
in Zed on 2026-11-06. No additional screenshot or exact editor-version metadata
was collected for these observations; VS Code verification remains pending.
