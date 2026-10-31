# Workflow

This guide builds a model from an empty folder: the toolbar of a blog, with a
wordmark, a blog link on wide screens, and a menu on narrow ones. Each step
says what you decide, why it comes at that point, and the commands. A test runs
every command here, in order, so the guide keeps working.

The order follows one idea: first decide **who you design for and under which
conditions**, then **what you build**, then **what must hold**, and last
**what has been checked**. Every later step then lands in a known, limited set
of combinations.

1. [Start a project](#1-start-a-project)
2. [Dimensions: what varies outside the UI](#2-dimensions-what-varies-outside-the-ui)
3. [Profiles: the combinations that exist](#3-profiles-the-combinations-that-exist)
4. [Declarations: states, types and checks](#4-declarations-states-types-and-checks)
5. [The tree: fragments, nodes and roots](#5-the-tree-fragments-nodes-and-roots)
6. [Variation: where dimensions apply and what changes](#6-variation-where-dimensions-apply-and-what-changes)
7. [Behavior: shared states and transitions](#7-behavior-shared-states-and-transitions)
8. [Rules: what must hold](#8-rules-what-must-hold)
9. [Review: look at each view](#9-review-look-at-each-view)
10. [Verify: record what was checked](#10-verify-record-what-was-checked)

Every editing command compiles the project with the change before it writes
anything, and refuses a change that would break it. Add `--dry-run` to see
what a command would write, and run `dimensions validate` at any point.

## 1. Start a project

```bash
dimensions init
```

This creates `.dimensions/` with an empty `types.json`.

## 2. Dimensions: what varies outside the UI

Decide what changes around the UI before drawing any of it: here, the screen
size and the two parts of input, which vary independently (a tablet can have
a keyboard).

```bash
dimensions dimension add breakpoint --values base,sm,lg,xl
dimensions dimension add pointer --values mouse,touch
dimensions dimension add keyboard --values keyboard,no-keyboard
```

The dimensions apply to nothing yet; step 6 attaches them to the tree. They
have no default, because profiles fill them in.

## 3. Profiles: the combinations that exist

On their own, the dimensions make 16 combinations, many of which no user has.
Name the setups that exist. Portrait and landscape tablets are two profiles,
because they show different toolbars. A setup that can be in several
combinations lists them with `|`, such as an iPad with a keyboard and trackpad
held either way: `profile add ipad-keyboard "breakpoint=sm|lg" pointer=mouse
keyboard=keyboard`. Profiles may share a combination.

```bash
dimensions profile add phone breakpoint=base pointer=touch keyboard=no-keyboard tablet-portrait breakpoint=sm pointer=touch keyboard=no-keyboard tablet-landscape breakpoint=lg pointer=touch keyboard=no-keyboard laptop breakpoint=lg pointer=mouse keyboard=keyboard desktop breakpoint=xl pointer=mouse keyboard=keyboard
```

Add profiles that belong together in one command: once profiles exist, only
their combinations do.

## 4. Declarations: states, types and checks

Declare the shared vocabulary before the nodes that use it, since a node
names its type. State groups are states that exclude each other; a type picks
the groups its nodes have. The menu's state shapes what exists below it, so
its type is shared. A check is a kind of verification that types require.

```bash
dimensions state-group add hover --values rest,hovered
dimensions state-group add focus --values blurred,focused
dimensions state-group add selection --values unselected,selected
dimensions type add link --groups hover,focus,selection
dimensions type add button --groups hover,focus
dimensions type add menu --states closed,open --shared
dimensions check add visual
dimensions type require link visual
```

## 5. The tree: fragments, nodes and roots

Build the toolbar once, as a fragment, and include it in the root that is
delivered: the article page. On the article page, the blog link is the
current page's link, so the include fixes it to `selected`.

```bash
dimensions fragment add toolbar --title Toolbar
dimensions node add wordmark --title Wordmark --parent toolbar --type button
dimensions node add links --title Links --parent toolbar
dimensions node add blog-link --title "Blog link" --parent links --type link
dimensions node add menu --title Menu --parent toolbar --type menu
dimensions node add menu-button --title "Menu button" --parent menu --type button
dimensions node add menu-panel --title "Menu panel" --parent menu
dimensions node add menu-link --title "Menu link" --parent menu-panel --type link
dimensions node add article-page --title "Article page"
dimensions node include article-page toolbar
dimensions node include-states article-page toolbar blog-link selection selected
dimensions node include-states article-page toolbar menu-link selection selected
```

## 6. Variation: where dimensions apply and what changes

Attach the dimensions to the toolbar; they then apply to its whole subtree,
wherever it is included. Then say what each value changes: the links exist
only on wide screens and the menu only on narrow ones (`node only`), touch
removes hover and no keyboard removes focus (overrides).

```bash
dimensions dimension apply breakpoint toolbar
dimensions dimension apply pointer toolbar
dimensions dimension apply keyboard toolbar
dimensions node only links breakpoint lg xl
dimensions node only menu breakpoint base sm
dimensions override states pointer=touch --type link --remove hovered
dimensions override states pointer=touch --type button --remove hovered
dimensions override states keyboard=no-keyboard --type link --remove focused
dimensions override states keyboard=no-keyboard --type button --remove focused
```

## 7. Behavior: shared states and transitions

The menu panel exists only while the menu is open. Transitions say how the
menu's state changes, on which event, and where keyboard focus ends up.

```bash
dimensions node only-when menu-panel menu open
dimensions node transition add menu open --from closed --to open --on click --target menu-button
dimensions node transition add menu escape --from open --to closed --on keydown --key Escape --focus menu-button
dimensions node transition add menu widen --from open --to closed --on resize --when breakpoint=lg,xl --focus blog-link
```

## 8. Rules: what must hold

Write down the requirements as rules, so no later change can quietly break
them. Each `expectation add` is checked like any other edit: a rule that fails,
or that tests nothing, is refused.

```bash
dimensions expectation add "Touch screens never show hover" --node toolbar --subtree --root article-page --when pointer=touch --then hover=rest
dimensions expectation add "Without a keyboard nothing shows a focus ring" --node toolbar --subtree --root article-page --when keyboard=no-keyboard --then focus=blurred
dimensions expectation add "A desktop link can be hovered and focused at once" --node blog-link --root article-page --when profile=desktop --some hover=hovered --some focus=focused
dimensions expectation add "The menu panel only exists while the menu is open" --node menu-panel --root article-page --when menu=closed --absent
dimensions expectation add "Escape closes the menu and returns focus to its button" --node menu --when menu=open --on keydown --key Escape --then menu=closed --then focus=menu-button
dimensions validate
```

The rules are kept in `.dimensions/expectations.json`; `expectation list` shows
them and `expectation remove <title>` removes one.

Every rule has a `title`, a `node`, an optional selection and filter, and
exactly one assertion. These are the keys in `expectations.json`, and the
`expectation add` options that write them (`--exists` and `--absent` write
`exists`):

| Key       | Meaning                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`   | What the rule says, shown when it fails                                                                                                                                                                       |
| `node`    | The node whose contexts it looks at                                                                                                                                                                           |
| `subtree` | `true` to look at every node below it too                                                                                                                                                                     |
| `root`    | Look only in this root                                                                                                                                                                                        |
| `when`    | Keep contexts with these values: dimensions, state groups, shared nodes, `profile`; a list means any of them                                                                                                  |
| `then`    | Every kept context has these values (or one of a list); `attributes` checks attribute values                                                                                                                  |
| `some`    | At least one kept context has these values                                                                                                                                                                    |
| `exists`  | `true`: the node is there wherever `when` holds; `false`: nowhere                                                                                                                                             |
| `on`      | A transition rule: the `event` and its fields (`key`, `target`, `outside`, or the dimension values a resize reaches); its `when` names the shared node's state before, its `then` the state after and `focus` |

The compiler checks the rules on every command from now on. A failing rule
names one context that breaks it, and it stops every command until the model
or the rule is fixed, so add a rule once the model can satisfy it, or fix the
model in the next edit.

## 9. Review: look at each view

Compare each view with the design, one profile or breakpoint at a time.
Anything you confirm and want to keep can become another rule.

```bash
dimensions views toolbar profile=phone
dimensions view toolbar profile=phone menu=open
dimensions axes toolbar breakpoint=lg
dimensions contexts blog-link --tree
dimensions contexts blog-link --table
dimensions contexts toolbar --subtree --table
```

`--table` prints Markdown tables: for a node, one per state group with a row
per profile; for a subtree, which nodes exist in which profiles. `--by
breakpoint` puts a dimension on the rows instead, and `--json` gives the same
tables as data.

## 10. Verify: record what was checked

Record each check's result in one context. `status` lists every required
check in every context as passed, failed or missing: what is left to check.

```bash
dimensions verify blog-link --check visual --result passed --by designer profile=desktop hover=rest focus=blurred selection=selected
dimensions status blog-link
```
