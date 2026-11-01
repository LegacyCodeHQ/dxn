import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const design = "design/website.png";
const revision = createHash("sha1").update("blob 5\0drawn").digest("hex");
const touch = { keyboard: "no-keyboard", pointer: "touch" };

const entry = (node: string, context: Record<string, string>, frame: string) => ({
  node,
  context: { ...touch, ...context },
  actor: "design-agent",
  at: "2026-10-31T12:00:00Z",
  source: { file: design, frame },
  fingerprint: revision,
});

// The closed menu button on a phone, and the open panel on a phone and on a
// tablet in portrait, which share a frame.
function project() {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
    "evidence/page.json": {
      version: 1,
      evidence: [
        entry(
          "menu-button",
          { breakpoint: "base", menu: "closed", hover: "rest", focus: "blurred" },
          "closedButton",
        ),
        entry("menu-panel", { breakpoint: "base", menu: "open" }, "openPanel"),
        entry("menu-panel", { breakpoint: "sm", menu: "open" }, "openPanel"),
      ],
    },
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), "drawn");
  return result;
}

const subtree = (...args: string[]) =>
  project().run(
    "prototype",
    "evidence",
    "toolbar",
    "--subtree",
    "--actor",
    "design-agent",
    ...args,
  );

describe("evidence --subtree", () => {
  it("prints a row per node and a column per profile: contexts with evidence out of all", () => {
    expect(subtree("--table").stdout).toBe(
      [
        "| node          | type | phone | tablet-portrait | tablet-landscape | laptop | desktop |",
        "| ------------- | ---- | ----- | --------------- | ---------------- | ------ | ------- |",
        "| toolbar       | —    | 0/1   | 0/1             | 0/1              | 0/1    | 0/1     |",
        "| wordmark      | link | 0/1   | 0/1             | 0/1              | 0/4    | 0/4     |",
        "| toolbar-links | —    | —     | —               | 0/1              | 0/1    | 0/1     |",
        "| blog-link     | link | —     | —               | 0/1              | 0/4    | 0/4     |",
        "| menu          | menu | 0/2   | 0/2             | —                | —      | —       |",
        "| menu-button   | link | 1/2   | 0/2             | —                | —      | —       |",
        "| menu-panel    | —    | 1/1   | 1/1             | —                | —      | —       |",
        "| menu-link     | link | 0/1   | 0/1             | —                | —      | —       |",
        "",
      ].join("\n"),
    );
  });

  it("with --missing, keeps only the nodes with contexts still to cover", () => {
    const nodes = subtree("--missing", "--table")
      .stdout.split("\n")
      .slice(2, -1)
      .map((line) => line.split("|")[1]?.trim());
    expect(nodes).not.toContain("menu-panel");
    expect(nodes).toContain("menu-button");
  });

  it("marks stale contexts in a cell", () => {
    const { run, root } = project();
    writeFileSync(join(root, design), "redrawn");
    const row = json(
      run("prototype", "evidence", "toolbar", "--subtree", "--actor", "design-agent"),
    ).rows.find(({ node }: { node: string }) => node === "menu-panel");
    expect(row).toEqual({
      node: "menu-panel",
      type: null,
      cells: [
        { present: 0, stale: 1, conflicting: 0, total: 1 },
        { present: 0, stale: 1, conflicting: 0, total: 1 },
        null,
        null,
        null,
      ],
    });
    expect(
      run("prototype", "evidence", "toolbar", "--subtree", "--actor", "design-agent", "--table")
        .stdout,
    ).toContain("| menu-panel    | —    | 0/1 · 1 stale |");
  });

  it("counts a node that no dimension applies to on every profile", () => {
    const { run } = project();
    const lines = run(
      "prototype",
      "evidence",
      "page",
      "--subtree",
      "--actor",
      "design-agent",
      "--table",
    ).stdout.split("\n");
    expect(lines[2]).toBe(
      "| page          | —    | 0/1   | 0/1             | 0/1              | 0/1    | 0/1     |",
    );
  });

  it("names the profiles of each column in JSON", () => {
    expect(json(subtree()).columns).toEqual([
      ["phone"],
      ["tablet-portrait"],
      ["tablet-landscape"],
      ["laptop"],
      ["desktop"],
    ]);
  });

  it("with --by frame, lists every frame under the node and the nodes it covers", () => {
    expect(subtree("--by", "frame", "--table").stdout).toBe(
      [
        "| frame                    | nodes       | profiles               | contexts | stale |",
        "| ------------------------ | ----------- | ---------------------- | -------- | ----- |",
        "| website.png#closedButton | menu-button | phone                  | 1        | 0     |",
        "| website.png#openPanel    | menu-panel  | phone, tablet-portrait | 2        | 0     |",
        "",
      ].join("\n"),
    );
  });
});
