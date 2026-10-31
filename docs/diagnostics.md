# Diagnostics

`dimensions validate`, and every command that compiles the project, reports
problems one per line on stderr:

```text
<file>:<line>:<column>: <code>: <message>
```

The file is absolute and the line and column are 1-based. There are no
warnings: every diagnostic is an error, and a project with any of them
doesn't compile. Reading commands then refuse to answer, and editing
commands refuse to write (exit 1).

Compiling stops early in two cases: when `types.json` can't be read or
parsed, and when a node or fragment file can't be parsed. Everything else
depends on those files, so fix the reported problems and run `validate`
again to see the rest.

Each section below is one code: what it means, and how to fix it. The
contents follow the order of the sections.

- [Files](#files)
- [JSON syntax](#json-syntax)
- [Shape and values](#shape-and-values)
- [Types, state groups, attributes and checks](#types-state-groups-attributes-and-checks)
- [Nodes, fragments and includes](#nodes-fragments-and-includes)
- [Shared states and onlyWhen](#shared-states-and-onlywhen)
- [Dimensions](#dimensions)
- [Profiles](#profiles)
- [Overrides and only](#overrides-and-only)
- [Transitions](#transitions)
- [Verification records](#verification-records)
- [Expectations](#expectations)

## Files

### `missing-file`

A required file doesn't exist. The usual case is `types.json`. Run
`dimensions init`, or create it with `{ "version": 1 }`.

### `not-a-file`

The path of a JSON file is a directory or something else that isn't a
regular file. Rename or remove it.

### `not-a-directory`

The project path, or one of `roots/`, `fragments/`, `dimensions/`,
`overrides/` and `verification/`, is not a directory. Remove the file in its
place.

### `unreadable-file`

The file exists but can't be read, for example because of permissions. The
message gives the system error.

### `invalid-encoding`

The file is not valid UTF-8. Save it as UTF-8.

### `invalid-file-name`

A file name can't be used as a name. Dimension names can't contain `+`. In a
combination file such as `overrides/breakpoint+pointer.json`, each part must
be a valid dimension name.

### `duplicate-dimension`

A combination file names a dimension twice, as in `pointer+pointer.json`.
Name each dimension once.

### `unsorted-dimensions`

A combination file doesn't list its dimensions in alphabetical order. Rename
it to the name the message gives, such as `breakpoint+pointer.json`, and nest
its overrides in that order.

### `undeclared-dimension`

`overrides/<name>.json` (or a part of a combination file name) names a
dimension that has no `dimensions/<name>.json`, and no shared node has that
id. Add the dimension, or rename or remove the overrides file.

### `unknown-root`

`verification/<name>.json` has no root `roots/<name>.json`. Records are filed
under the root they belong to. Move them to the right file, or remove the
file.

### `file-name-mismatch`

A file's top node doesn't match its file name: the fragment `toolbar` must
be in `fragments/toolbar.json`, and the root `article-page` in
`roots/article-page.json`. Rename the file or the node (`node rename` does
both).

## JSON syntax

The files are strict JSON: no comments, no trailing commas.

### `unexpected-end`

The file ends in the middle of a value, usually because of a missing `}` or
`]`.

### `unexpected-token`

A character that can't start or continue a value here, such as a trailing
comma, a comment or an unquoted key.

### `too-deep`

Values are nested more than 512 levels deep. Flatten the tree.

### `duplicate-key`

An object has the same key twice. Keep one of them.

### `unterminated-string`

A string has no closing quote.

### `invalid-character`

A string contains a raw control character, such as a tab or a newline. Write
it as an escape (`\t`, `\n`) instead.

### `invalid-escape`

A backslash escape isn't one JSON allows, or a `\u` escape isn't four hex
digits.

### `invalid-surrogate`

A `\u` escape is half of a surrogate pair without the other half.

### `invalid-number`

A number isn't valid JSON, for example `01` or a lone `-`.

### `byte-order-mark`

The file starts with a byte order mark. Save it as UTF-8 without a BOM.

### `trailing-content`

Something follows the root value. A file holds exactly one object.

## Shape and values

These apply to every file and follow its schema in `schema/`.

### `unsupported-version`

`version` is not `1`.

### `missing-key`

A required key is missing, for example a node without `title`, or a
verification record without `context` or `transition`.

### `unknown-key`

A key that isn't allowed here, often a typo. On a transition, it is also a
field its event doesn't use: `click`, `input` and `change` take only
`target`, `keydown` only `key`, `pointerdown` only `target` or `outside`, and
`resize` only `when`, each with an optional `focus`. In a verification record's
context, it is a name that is neither a dimension of the node nor one of its
state groups or shared ancestors.

### `wrong-type`

A value has the wrong JSON type, such as a string where a list is expected.
The message says what was expected and what was found.

### `empty-string`

A name, id or title is empty or blank.

### `control-character`

A name, id or title contains a control character.

### `surrounding-whitespace`

A name, id or title starts or ends with whitespace. Trim it.

### `empty-values`

A list of values is empty: a dimension's values, a state group's values, a
attribute's values, a type's states, the group values a type uses, or
the values an include fixes. List at least one.

### `duplicate-value`

A list of values names the same value twice. Remove the repeat.

## Types, state groups, attributes and checks

### `undefined-type`

A node, override or transition names a type that `types.json` doesn't
define. Add it with `type add`, or fix the name.

### `states-and-groups`

A type has both `states` and `stateGroups`. Use one or the other: a plain
list for one set of states, or groups for independent sets.

### `undeclared-state-group`

A type uses a state group that `stateGroups` doesn't declare. Declare it with
`state-group add`, or fix the name.

### `duplicate-state-group`

A type lists the same state group twice. Remove the repeat.

### `duplicate-state`

A state is listed twice in a type's `states` or in an `onlyWhen` list, or an
override adds a state the type already has. Remove the repeat.

### `ambiguous-state`

Two of a type's state groups share a value name, so a state name wouldn't
say which group it belongs to. Rename the value in one group
(`state-group rename-value`).

### `reserved-name`

A name is taken. A state group can't be called `state`, which is the key for
a plain states list. A dimension can't be called `state`, or have the name of
a state group or a shared node, because contexts use those names as keys,
and it can't be called `profile`, which commands use to pick a profile.
Rename it.

### `shared-without-states`

A type is `"shared": true` but has no states for its instances' subtrees to
vary with. Give it states, or remove `shared`.

### `shared-with-several-groups`

A shared type uses more than one state group. A shared node's state is named
by its id (`menu=open`), so it can only have one. Use one group or a plain
states list.

### `unknown-state`

A state that the type (or the shared ancestor) doesn't have here: in an
override, a attribute value, an `onlyWhen` list, a transition, an
include state, or a verification record. The message names the state. Check
the spelling, or add the state to the type.

### `undeclared-attribute`

A attribute that `attributes` doesn't declare. Declare it with
`attribute add`, or fix the name.

### `unknown-value`

A attribute value that the attribute doesn't declare. Add it with
`attribute add-value`, or use a declared value. In an expectation's `where`,
it is a value that the dimension, state group or shared node doesn't have.

### `attributes-without-type`

A node sets `attributes` but has no type, so it has no states to set
them for. Give the node a type, or set the values on a type.

### `undeclared-check`

A type requires a check, or a record names one, that `checks` doesn't
declare. Declare it with `check add`.

### `duplicate-check`

A type requires the same check twice. Remove the repeat.

## Nodes, fragments and includes

### `duplicate-id`

Two nodes share an id (ids are unique across the whole project), or a node
has two transitions with the same id. The message points to the first use.
Rename one with `node rename`.

### `include-at-root`

A file's root is an include. A root must be a node. Put the include in its
children.

### `unknown-fragment`

An include names a fragment that has no `fragments/<id>.json`.

### `include-cycle`

An include leads back to the file it is in, directly or through other
fragments. Remove one of the includes.

### `duplicate-include`

A root includes the same fragment twice, directly or through other
fragments, so its nodes would appear twice. Remove one include, or make a
second fragment.

### `node-outside-include`

An include's `states` names a node that isn't in the included fragment.

### `unknown-state-group`

An include's `states` names a state group the node doesn't use.

### `empty-only`

An `only` entry or an `onlyWhen` list is empty, so the node would never
exist. List at least one value. To remove a restriction,
delete the entry (`node only ... --everywhere`, `node only-when ... --always`).

## Shared states and onlyWhen

### `not-an-ancestor`

`onlyWhen` names a node that isn't an ancestor of this node in the same file.
A fragment's nodes can only depend on shared nodes inside the fragment.

### `ancestor-not-shared`

`onlyWhen` names an ancestor whose type isn't shared, so its state doesn't
shape its subtree. Mark the type shared with `type share`.

## Dimensions

### `unknown-dimension-value`

A value that the dimension doesn't have: in `default`, an override, `only`,
a combination file, a transition's `when`, or a verification record. Add it
with `dimension add-value`, or fix it.

### `empty-applies-to`

`appliesTo` is an empty list. List at least one node, or leave `appliesTo` out
while the dimension applies to nothing yet.

### `unknown-node`

A node id that doesn't exist: in `appliesTo`, an override, `only`, a
transition, a verification record or an expectation. Check the spelling.
After `node rename`, references are updated automatically.

### `duplicate-node`

`appliesTo` lists the same node twice. Remove the repeat.

## Profiles

### `incomplete-profile`

A profile leaves out a dimension that other profiles give. Every profile gives
one value for each dimension the profiles cover, so add the missing value.

### `unknown-profile`

A modifier is on a profile that `profiles.json` does not have.

### `unprofiled-dimension`

A modifier sets a dimension that the profiles do not give. A modifier changes
profiles' values, so it can only set the dimensions they cover.

### `modifier-changes-nothing`

A modifier sets only values a profile it is on already has, so it would add
nothing there. Take that profile out of its `on`.

### `profiled-default`

Profiles cover a dimension that has a `default`. Profiles fill that dimension
in from the one profile that fits what you give, so its default would never
be used. The error is in `profiles.json`, because profiles build on dimensions:
the dimension file is valid on its own. Remove the default.

### `no-profile`

A combination that no profile has, for example `breakpoint=xl` with
`pointer=touch`: in a verification record's context, or as a combination
override in `overrides/<a>+<b>.json`, which could never apply. Use the values
of one of the profiles (`profile list` shows them), or remove the override.

## Overrides and only

### `node-out-of-scope`

An override or `only` entry targets a node that the dimension doesn't apply
to. Apply the dimension to the node or an ancestor (`dimension apply`), or
remove the entry. In a shared node's overrides file, the node isn't below
that shared node.

### `override-without-type`

A node override changes states or values for a node that has no type. Give
the node a type.

### `conflicting-state`

An override both adds and removes the same state. Keep one.

### `removed-state`

A state that is already removed in this context: an override removes it
again, a attribute value is set for it, or a verification record names
it. For example, under `pointer=touch` the toolbar links have no `hovered`
state.

### `conflicting-override`

Two overrides with the same precedence disagree in a context where both
apply. For example, `breakpoint=sm` and `pointer=touch` both set a value for
the same node and state. The message names both. Add a combination override
(`override set breakpoint=sm,pointer=touch ...`) that settles the
combination, or make the two agree. See the precedence list in
[concepts.md](concepts.md#overrides).

### `absent-in-context`

An override or a verification record is about a node in a context where the
node doesn't exist, because `only` or `onlyWhen` leaves it out. The message says
which. For example, `toolbar-links` exists only at `lg` and `xl`, so an
override at `breakpoint=sm` for `blog-link` is an error.

## Transitions

### `transitions-without-shared-state`

A node has transitions, but its type isn't shared. Transitions change a
shared node's state, so mark the type shared (`type share`).

### `same-state-transition`

A transition's `from` and `to` are the same state. A transition must change
the state; to describe an event that leaves it as it is, leave it out.

### `target-and-outside`

A `pointerdown` transition names both `target` and `outside`. It happens on
one node or outside one, so keep one of them.

### `unknown-event`

`on` isn't one of the supported events: `click`, `input`, `change`,
`keydown`, `pointerdown`, `resize`. In a transition rule, it is the `event` in
`on`.

### `target-absent`

The transition's `target` (or `outside`) doesn't exist while the shared node
is in the `from` state. For example, a click on `menu-blog-link` can't open
the menu, because the link only exists while the menu is open.

### `focus-absent`

The node named in `focus` doesn't exist after the transition (in the `to`
state, or at the `when` values of a resize), so it can't take focus.

### `duplicate-transition`

Two transitions have the same `from` state, event and target (or key, or
`when`), so the same event would lead to two places. Remove one.

## Verification records

### `duplicate-record`

Two records have the same node, context (or transition) and check. `verify`
replaces records instead of adding them, so keep the newer one.

### `context-and-transition`

A record has both `context` and `transition`. It is about one or the other.

### `unknown-transition`

A record names a transition that the node doesn't have.

### `check-not-required`

A record names a check that the node's type doesn't require. Require it
(`type require`), or remove the record.

### `verification-without-type`

A record is about a node without a type, which has no checks.

### `node-outside-file`

A record in `verification/<root>.json` is about a node that isn't in that
root. Move it to the right root's file.

### `excluded-state`

A record names a state that an include excludes in this root, for example
`selection=unselected` for the article page's `blog-link`, which the include
fixes to `selected`.

### `unknown-result`

`result` is not `"passed"` or `"failed"`.

### `invalid-timestamp`

`at` isn't an ISO 8601 date and time with a time zone, such as
`2026-10-30T19:20:00Z`.

## Evidence

`evidence/<root-id>.json` is checked once the model compiles, against the
node's contexts. Entries also report `unknown-node`, `node-outside-file` and
`invalid-timestamp`, and a file named after no root reports `unknown-root`.

### `unknown-context`

An entry's context is not one of the node's contexts in that root. A context
must be complete: every dimension, state and shared node's state the node has,
exactly as `dimensions evidence <node-id> --actor <name>` lists them.

### `undeclared-actor`

An entry names an actor that `actors.json` does not declare. Add it with
`dimensions actor add <name>`.

### `missing-source`

The file an entry points to does not exist. Paths are relative to the folder
that holds `.dimensions`, normally the repository's root.

### `invalid-revision`

An entry's revision is not a git blob hash. Use what `git hash-object <file>`
prints when the entry is recorded. When the file changes, the entry is not an
error: `dimensions evidence` shows it as stale.

### `duplicate-evidence`

Two entries have the same node, context, actor and frame.

## Expectations

The compiler checks `expectations.json` once everything else compiles. Like
any other error, a failing expectation stops reading commands and refuses the
edit that caused it.

### `node-outside-root`

The expectation's `root` doesn't contain its node.

### `unknown-name`

A key in `when`, `then` or `some` is neither a dimension, a state group,
`state`, a shared node that applies to the node, nor `profile` (when there are
profiles). `exists` looks only at dimensions, profiles and shared nodes, so a
state group in its `when` is also this error.

### `several-assertions`

An expectation has more than one of `then`, `some` and `exists`. Each
expectation makes one assertion; split it into two.

### `empty-expectation`

The expectation selects no contexts, or a transition rule matches no
transition, so it tests nothing and would pass whatever the model said. For example, a rule about tablets with a keyboard
when no profile has touch with a keyboard. Fix its `when`, or remove it.

### `expectation-failed`

The model breaks the rule. The message names one context that breaks it, by
profile where it matches one, for example "home-link at tablet-landscape
(hover=hovered, focus=blurred) breaks hover=rest". Either the model is wrong
(fix the types, dimensions, overrides or profiles) or the expectation is.
`dimensions show` or `contexts` with the same values shows that context.
