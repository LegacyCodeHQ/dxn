# Release checklist

What stands between this repository and the first open-source release of
dxn and its editor extensions, as checked on 2026-11-01. Tick an item in the
commit that does it, and add what a release turns up.

## Done

- [x] The JSON prototype is removed: the CLI is the language's commands
  only, and `make check` passes.
- [x] README.md and AGENTS.md describe the language, with a working example.
- [x] History has no secrets: gitleaks scans every commit, locally and in
  CI.
- [x] CI runs the full gate: lint, types, the dependency audit, coverage and
  a smoke test of the built CLI.
- [x] Only built code and the docs are published: `npm pack` for the CLI
  gives 20 files, 41 kB.
- [x] A license is chosen: Apache-2.0, declared in every package.json.
- [x] The repository is public on GitHub (LegacyCodeHQ/dxn), so Zed can
  fetch the grammar the extension pins.

## Must have

- [ ] **A LICENSE file at the root**, with the Apache-2.0 text. npm then
  includes it in each package.

## Publishing

- [ ] **Install with the scoped name.** The unscoped npm name `dxn` belongs to
  an unrelated package, so the README says
  `npm install -g @legacycodehq/dxn`, or `npx @legacycodehq/dxn`; the
  command stays `dxn`. `@legacycodehq/dxn` and
  `@legacycodehq/dxn-language` are free.
- [ ] **The packages can be published:** `"private": true` removed from
  `packages/cli` and `packages/language`, and a first version in place of
  `0.0.0`.
- [ ] **A changelog,** starting from the first release.
- [ ] **A release workflow** that publishes both packages from CI.
- [ ] **An install section in the README** for users, before the
  development section.

## Zed extension

The extension in `packages/zed` gives highlighting, the outline and run
buttons itself, and everything else through `dxn-language-server`, which it
starts; the run buttons run `dxn`. Today it finds both on the `PATH`, where a
developer links them with `npm link`; a user who installs it from Zed has
neither. A Zed extension is WebAssembly and cannot hold a Node program, so it
installs the server from npm, as the Svelte, Astro and Vue extensions do.

### The language server, on npm

- [ ] **One self-contained package:** bundle `@legacycodehq/dxn-language`
  into `@legacycodehq/dxn-language-server`'s `dist/main.js`, so it is one
  package with no workspace dependency. `npm pack` shows what it holds, and
  `node dist/main.js --version` from the packed tarball, outside the
  repository, still starts.
- [ ] **Publishable:** `"private": true` removed, a first version in place of
  `0.0.0`, and its README saying what it is and how an editor starts it.
- [ ] **Published from CI,** with the CLI and the language, by the release
  workflow above.

### The extension installs the server

- [ ] **`language_server_command` installs it:** with `zed_extension_api`'s
  npm functions, the latest `@legacycodehq/dxn-language-server` into the
  extension's own folder, run with Zed's Node; updated when a newer version is
  out. The `lsp.dxn-language-server.binary` setting still wins, for working on
  the server.
- [ ] **A test for it,** like the ones for choosing the server today, and a
  run in Zed with the linked server unlinked
  (`npm unlink -g @legacycodehq/dxn-language-server`), so nothing on the
  `PATH` hides a failure.

### The run buttons

- [ ] **They work without a developer's `dxn`:** the tasks in
  `languages/dxn/tasks.json` run `npx --yes @legacycodehq/dxn …`, or the
  extension's README says to install `@legacycodehq/dxn` first. Decide which,
  and try it with the linked `dxn` unlinked
  (`npm unlink -g @legacycodehq/dxn`).
- [ ] **Zed reads the extension's `tasks.json`:** confirmed on 2026-11-01 for
  a dev extension; check it again in an installed one.

### Ready to submit

- [ ] **A LICENSE file Zed's registry accepts,** where it looks for one: Zed
  checks extensions for an accepted license (Apache-2.0 is one). Check the
  current rule in Zed's extension docs, and add the file at the root and, if
  needed, in `packages/zed`.
- [ ] **The grammar pin is current:** `commit` in `extension.toml` is the
  latest commit of `packages/tree-sitter-dxn`, pushed; `make zed` checks it
  matches.
- [ ] **`extension.toml` says what it does now:** its `description` lists
  highlighting, errors, navigation, completion, rename and running types and
  expectations; `version` is the release's; `authors` and `repository` are
  right.
- [ ] **Formatting on save:** Zed 1.26 does not format `.dxn` files on save
  until a user's settings turn on `format_on_save` for them, as the README
  says. Check whether an extension can turn it on itself, as the VS Code one
  does; if not, keep the README's setting where users will see it.
- [ ] **The README is for users first:** installing from Zed's extensions
  view, what it gives, and what to install (if the run buttons need `dxn`),
  before the development sections.
- [ ] **Tried from scratch** in the settings example: `make check`, the extension
  rebuilt, the linked server and CLI unlinked, every item in
  `examples/settings/README.md` for Zed.
- [ ] **Submitted:** a pull request to `zed-industries/extensions` that adds
  this repository as a submodule and an entry for `dxn` in its
  `extensions.toml`, with `path = "packages/zed"` and the extension's
  version. Its README says how; a release after this one bumps the version
  in both places.

## VS Code extension

The extension in `packages/vscode` bundles everything it runs: the language
server and the `dxn` command, built by `make build` into `dist/` and run with
VS Code's own Node. A user installs it and needs nothing else, so its release
is packaging and publishing, not installing a server.

### The package

- [ ] **Only what it runs is packaged:** a `.vscodeignore` that leaves out
  `src/`, `test/`, `build.mjs` and the TypeScript, so the `.vsix` holds
  `dist/`, `syntaxes/`, `language-configuration.json`, `package.json`, the
  README, the changelog and the license. `npx @vscode/vsce ls` lists it.
- [ ] **Packaged without its dependencies,** which `dist/` already bundles:
  `vsce package --no-dependencies`. Check the `.vsix`'s size stays near
  `dist/`'s, about 2 MB.
- [ ] **`package.json` is the Marketplace page's:** `displayName`,
  `description`, `version`, `publisher` (`legacycodehq`), `repository`,
  `categories`, `keywords`, a 128×128 PNG `icon`, and `license`; check
  whether `"private": true` must go for `vsce`.
- [ ] **The README is for users first,** as the Marketplace shows it: what
  the extension does, with a screenshot or two, before the development
  sections, which can move to a CONTRIBUTING note.
- [ ] **A CHANGELOG.md** in `packages/vscode`, which the Marketplace shows.
- [ ] **The minimatch override is still needed:** the root `package.json`
  overrides `vscode-languageclient`'s `minimatch` to 11.0.1, for a moderate
  advisory in 10. Remove it once the client depends on a fixed release.

### Tried as users get it

- [ ] **Installed from the `.vsix`,** not loaded for development:
  `code --install-extension dxn-<version>.vsix` in a fresh profile
  (`code --profile dxn-release`), with nothing linked on the `PATH`
  (`npm unlink -g @legacycodehq/dxn @legacycodehq/dxn-language-server`).
- [ ] **Every item in `examples/settings/README.md`,** with the example opened as
  a folder, the code lenses too.
- [ ] **In Cursor too,** which installs from Open VSX rather than the
  Marketplace.

### Published

- [ ] **A publisher on the VS Code Marketplace:** `legacycodehq`, created
  from an Azure DevOps organization, with a personal access token that may
  publish.
- [ ] **A namespace on Open VSX** (`legacycodehq`), for Cursor, VSCodium and
  other editors that do not use the Marketplace, with its own token.
- [ ] **Published from CI,** by the release workflow, with both tokens as
  secrets: `vsce publish --no-dependencies` and `ovsx publish`. The version
  is the same release's as the npm packages' and the Zed extension's.

## Loose ends

- [x] **neo-website's `.dxn/` folder** (14 files) is removed: `spec/` holds
  all of it, the same evidence, dimensions, profiles, modifier and
  expectations; git keeps the history.
- [ ] **design.md refers to neo-website's toolbar,** which readers cannot
  follow while neo-website is private: link it, or describe it in place.

## For contributors

- [ ] **CONTRIBUTING.md:** tests first, conventional commits, one capability
  per commit, and how to propose a change to the language. AGENTS.md
  holds most of it already.
- [ ] **Design principles,** so a proposal that adds syntax can be judged
  against them: closed value sets, everything declared, one meaning per
  line, errors that say what to write instead.
- [ ] **CODE_OF_CONDUCT.md and SECURITY.md,** and issue templates.
- [ ] **A version for the language itself,** apart from the tool's, so a
  change in what a file means is announced, not silent.
