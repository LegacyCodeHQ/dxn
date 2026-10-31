import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

const design = "design/website.pen";
const drawn = "the toolbar, drawn";
// The git blob hash of a file's content, as "git hash-object" prints it.
const revisionOf = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");

const closedOnPhone = {
  breakpoint: "base",
  keyboard: "no-keyboard",
  pointer: "touch",
  menu: "closed",
  hover: "rest",
  focus: "blurred",
};

const entry = (changes: Record<string, unknown> = {}) => ({
  node: "menu-button",
  context: closedOnPhone,
  actor: "design-agent",
  at: "2026-10-31T12:00:00Z",
  source: { file: design, frame: "vbGba" },
  revision: revisionOf(drawn),
  ...changes,
});

// The toolbar with a design-agent, the design file next to .dimensions, and
// these evidence entries for the page root.
function project(entries: unknown[], extra: Record<string, unknown> = {}) {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": {} } },
    "evidence/page.json": { version: 1, evidence: entries },
    ...extra,
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), drawn);
  return result;
}

const problems = (entries: unknown[], extra: Record<string, unknown> = {}) =>
  project(entries, extra)
    .run("validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));

describe("evidence entries", () => {
  it("fill the row of the context they name, with where they point", () => {
    const { run } = project([entry()]);
    const rows = json(run("evidence", "menu-button", "--actor", "design-agent")).contexts;
    expect(rows[0].evidence).toEqual([
      {
        at: "2026-10-31T12:00:00Z",
        source: { file: design, frame: "vbGba" },
        revision: revisionOf(drawn),
        stale: false,
      },
    ]);
    expect(rows.slice(1).map((row: { evidence: unknown[] }) => row.evidence)).toEqual([[], [], []]);
    expect(run("evidence", "menu-button", "--actor", "design-agent", "--table").stdout).toContain(
      "| touch   | closed | website.pen#vbGba |",
    );
  });

  it("are stale once the file they point to changes", () => {
    const { run, root } = project([entry()]);
    writeFileSync(join(root, design), "the toolbar, redrawn");
    expect(run("validate").code).toBe(0);
    expect(
      json(run("evidence", "menu-button", "--actor", "design-agent")).contexts[0].evidence[0],
    ).toMatchObject({ stale: true });
    expect(run("evidence", "menu-button", "--actor", "design-agent", "--table").stdout).toContain(
      "| website.pen#vbGba (stale) |",
    );
  });

  it("name the revision git prints for the file", () => {
    const { root } = project([entry()]);
    expect(
      execFileSync("git", ["hash-object", join(root, design)], { encoding: "utf8" }).trim(),
    ).toBe(revisionOf(drawn));
  });

  it("are checked against the model, the actors and the files", () => {
    const { hover: _, ...partial } = closedOnPhone;
    expect([
      problems([entry()]),
      problems([entry({ actor: "designer" })]),
      problems([entry({ context: partial })]),
      problems([entry({ context: { ...closedOnPhone, hover: "hovered" } })]),
      problems([entry({ node: "nope" })]),
      problems([entry({ source: { file: "design/missing.pen", frame: "vbGba" } })]),
      problems([entry({ revision: "abc" })]),
      problems([entry(), entry()]),
      problems([entry({ comment: "x" })]),
    ]).toEqual([
      [],
      ['undeclared-actor: actor "designer" is not declared in actors.json'],
      [
        'unknown-context: menu-button has no such context in root "page"; "dimensions evidence menu-button --actor <name>" lists them',
      ],
      [
        'unknown-context: menu-button has no such context in root "page"; "dimensions evidence menu-button --actor <name>" lists them',
      ],
      ['unknown-node: node "nope" does not exist'],
      ['missing-source: "design/missing.pen" does not exist in the repository'],
      ["invalid-revision: must be the file's git blob hash: 40 hexadecimal characters"],
      ["duplicate-evidence: another entry has the same node, context, actor and frame"],
      ['unknown-key: unknown key "comment"'],
    ]);
  });

  it("belong to a root", () => {
    expect(problems([], { "evidence/nope.json": { version: 1, evidence: [] } })).toEqual([
      "unknown-root: no roots/nope.json defines this root",
    ]);
  });
});
