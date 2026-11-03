# CLI and editor parity audit

Audited on 2026-11-03 against `5dd966a`. Both disagreements found in the audit
are now fixed and covered by regression tests. The reproductions below describe
the original behavior.

## Findings

### Drawing paths use different fallback roots outside Git

A nested model can show recorded evidence in `dxn status` and gone evidence in
the editor, with identical saved input. The CLI calls
`repositoryOf(absoluteModelPath, cwd)` in `commands/status.ts` and
`commands/support/stored.ts`. The language server calls
`repositoryOf(absoluteModelPath)` in `protocol/evidence.ts`. Without a `.git`
ancestor, the former falls back to the command's working directory, the latter
to the model's directory. Shared `freshness` and `drawings` functions therefore
receive different roots. Rename and review callers also need review when fixing
the root policy.

Reproduced with this layout in a fresh temporary directory outside Git:

```text
project/
  design.pen
  specs/
    spec.dxn
    evidence/a.json
```

`spec.dxn` declares `type Link {}`, a record `Evidence` with `source: PenNode`,
and `actor Designer records Evidence`. `design.pen` contains one frame with ID
`frame`. The evidence is for `Link`, has empty dimensions and states, actor
`Designer`, and source `{ file: "design.pen", frame: "frame", fingerprint }`,
where the fingerprint is taken from that frame with `Fingerprints.of`.

From `project/`, `status specs/spec.dxn --json` reports one recorded combination
and zero gone. `hintsBeside` for the same saved model reports zero recorded and
one gone. This reproduction used the same adapter functions as the parity suite.
No VS Code host behavior is needed to trigger it.

Resolution: `repositoryOf(modelPath)` now owns one policy: the nearest ancestor
with a `.git` entry, otherwise the model's directory. Its caller-selectable
fallback was removed. Status, validation, rename, attach and review all use it.
Regression tests cover nested files with and without a Git root and commands
run from the project directory, model directory and an unrelated directory.
They compare evidence counts and drawing diagnostics with the editor, check
that renames cannot bypass drawing validation, and exercise attach and review.

Outside Git, existing paths relative to the CLI working directory may need
updating to be relative to the model's directory. Git-root-relative paths retain
their meaning. The model path itself is still resolved against the CLI working
directory.

### A CLI refusal suppresses other stored-record problems

`loadStoredToCount` returns as soon as `checkStored` finds a record with stored
files but no actor. It discards other problems that the shared checker has
already found. The editor reports both the unrecorded record and problems in
other records. This violates the repository's stated intent that the CLI say
every fact the editor says.

Reproduced by extending the parity suite's `model` with:

```dxn
record Note {
  text: NonEmptyString
}
```

Store `[]` in `note/a.json` and a normal `Evidence` entry in `evidence/a.json`
whose hover state is `bogus`. The CLI's check/validate problem union contains only
the refusal that no actor records `Note`. The editor additionally reports
`evidence/a.json:2:73: error: unknown-value`.

Resolution: the CLI now reports every problem returned by `checkStored` before
returning the unrecorded-record refusal. Exit code 1 and refusal to write are
preserved. Regression tests compare mixed-record diagnostics and rename refusal
with the editor, and verify that validate, status and rename include the other
record's error while leaving source and stored records unchanged. Status still
refuses the operation, so it does not return counts in this scenario.

## Shared responsibilities and remaining duplication

| Capability                                                 | Shared language decision                                  | Adapter work and audit result                                                                                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source checks and expectations                             | `parse`                                                   | CLI reports diagnostics; editor maps them to LSP ranges. Existing scenarios and a failing expectation agree.                                                                                       |
| Stored records                                             | `storedBeside`, `checkStored`                             | Disk versus open-buffer reads are intentional. Mixed-record errors are now preserved before refusal.                                                                                               |
| Cursor rename                                              | `renameAt`                                                | CLI writes results; editor returns edits. Added type, state, actor, value-collision and record-folder scenarios agree.                                                                             |
| Folder rename                                              | `renameAt` chooses folder names                           | Both adapters independently check folder existence and destination collisions. They agree in the added scenarios; editor capability refusal is intentional and already tested in `server.test.ts`. |
| Formatting                                                 | `format`                                                  | Syntax refusal, unchanged text and formatted output agree. Semantically invalid syntax can still be formatted.                                                                                     |
| Evidence counts                                            | `countable`, `coverage`, `progress`, `freshness`          | Both adapters independently guard tree placement; progress chooses editor presentation. Both adapters now use the same root policy.                                                                |
| Code lenses                                                | `symbols`; CLI command implementations                    | Added tests carry the LSP arguments through the VS Code invocation helper and compare actual CLI output and exit codes for nested types and selected passing/failing expectations.                 |
| Definitions, references, completion, outline, highlighting | Language editor functions                                 | No corresponding CLI command; existing editor tests cover these.                                                                                                                                   |
| Attach and review-page generation                          | Language evaluation/evidence functions plus command logic | No editor equivalent. `attach.ts` still owns substantial context selection and replacement decisions; this is an architecture extraction candidate rather than a demonstrated parity bug.          |

## Test coverage changes and limits

The parity harness now advertises folder-move support and compares both edited
file content and folder moves. Previously it inspected only `WorkspaceEdit.changes`;
it could not compare the `documentChanges` representation used for folder moves.
The added folder scenario failed with the old harness before it was extended.
The parity suite now includes the mixed-record regression, and `drawing-root.test.ts` covers root selection across command callers.

The existing evidence-count comparison remains one-way: every parsed editor count
must appear among CLI path counts. It omits path identity, ignores unrecognized
label text, and permits missing editor counts. Component usage labels and counts
aggregated at a declaration need an explicit comparison model before tightening
this safely. A passing case here does not prove complete evidence parity.

Diagnostics parity calls the protocol diagnostic adapters directly. Rename,
formatting and code-lens parity use an in-process LSP connection. The audit does
not execute the VS Code extension host, Zed, file permission failures or
concurrent filesystem changes. Existing server tests cover unsaved stored JSON
and model buffers; CLI/editor input differences from unsaved buffers are expected.
