# Playground

A small dxn project to try the editor extensions in, for
[Zed](../packages/zed) and [VS Code](../packages/vscode), and the `dxn`
command. `settings.dxn` models a settings window and uses every construct of
the language at least once; `evidence/` holds records stored against it.

It is tracked in git, so try anything here: `git checkout playground` and
`git clean -fd playground` put it back. A test keeps it free of problems, with
records that check.

## Opening it

- **Zed:** open this folder. The extension, the language server and `dxn` are
  set up as their READMEs say.
- **VS Code:** open it with the extension loaded for development:

  ```bash
  code --extensionDevelopmentPath=../packages/vscode .
  ```

## What to try

Line numbers are those of `settings.dxn` as committed.

### Highlighting and errors

- Keywords, types, states, actions, events, profiles and values each have
  their colour; comments are dimmed.
- Change `Hover` on line 21 to `Hovr`: a squiggle, and "did you mean Hover?".

### Outline

- The outline lists the declarations, with `Help`'s nested `Toggle` and
  `Text`, its event, enum, state, children and actions inside it.

### Go to definition and hover

- `Openness` on line 54 goes to line 48: an enum declared inside `Help`.
- In `on toggle.activate` (line 68), `toggle` goes to line 63 and `activate`
  to line 52, Toggle's event.
- `current` on line 37 goes to line 30, where `TabBar` receives it.
- Hover over `hovered` on line 23 for its enum, and over `Tab` on line 36 for
  the type and the comment above it.
- In the expectations, `Window.tabs.general` (line 104) goes part by part,
  and `close` on line 111 goes to `Help`'s event.

### Find usages

- `Theme` (line 8): `Help`'s and `Text`'s needs, and `Text`'s derived state.
- `hover` in `Tab` (line 21): its rule and `alike`, and line 100, where an
  expectation below `Window` names it; Toggle's `hover` (line 53) is used
  there too.

### Completion

- After `state pressed: ` inside `Toggle`: enums, `Openness` first.
- After `on ` inside `Help`: its event and children; after `on toggle.`:
  Toggle's event.
- After `then ` in the last expectation: `Help`'s state and children.

### Rename

Each rename changes the file and the stored records in `evidence/` together.

- `Theme` → the key in stored `dimensions`; `dark` → their values.
- `current` in `Window` (line 74), or in either receiver: all three
  together, and the stored parents' and states' keys.
- `help` in `Window` (line 77): stored paths and the parents' key
  `help.openness`.
- `trackpad` and `phone`: the stored profile `phone+trackpad`, part by part.
- `close` on line 47 or 67: one at a time; an event and an action share the
  name, and `dxn rename` asks which, as `event:Help.close`.
- `Evidence` (line 92): moves `evidence/` to the new name's folder.

### Running

- The run button beside each `type` runs `dxn states` for it; `Toggle` runs
  as `Help.Toggle`.
- The one beside each `expect` runs it alone and says it holds. Change
  `then hover = rest` on line 100 to `then hover = hovered` to see it fail,
  and its button turn to a cross.

## Checking it from the command line

```bash
dxn check settings.dxn
dxn validate settings.dxn
dxn status settings.dxn
```
