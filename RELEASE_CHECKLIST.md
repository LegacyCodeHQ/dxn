# Release checklist

What stands between this repository and its first open-source release, as
checked on 2026-11-01. Tick an item in the commit that does it, and add what
a release turns up.

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

## Must have

- [ ] **A LICENSE file at the root**, with the Apache-2.0 text. npm then
  includes it in each package.
- [ ] **The repository is public** on GitHub (LegacyCodeHQ/dxn), once
  everything above is in.

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

## Loose ends

- [ ] **neo-website's `.dxn/` folder** (14 files) is no longer read by any
  dxn command now that the prototype is gone. Confirm that `spec/` holds
  all of it, then remove it; git keeps the history.
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
