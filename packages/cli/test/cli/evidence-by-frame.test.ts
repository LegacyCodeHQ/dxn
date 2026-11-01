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

// One frame for the closed menu button on a phone and on a tablet in
// portrait, which look the same; another for the open one on a phone.
const entry = (breakpoint: string, menu: string, frame: string) => ({
  node: "menu-button",
  context: {
    breakpoint,
    keyboard: "no-keyboard",
    pointer: "touch",
    menu,
    hover: "rest",
    focus: "blurred",
  },
  actor: "design-agent",
  at: "2026-10-31T12:00:00Z",
  source: { file: design, frame },
  fingerprint: revision,
});

function project() {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
    "evidence/page.json": {
      version: 1,
      evidence: [
        entry("base", "closed", "closedButton"),
        entry("sm", "closed", "closedButton"),
        entry("base", "open", "openButton"),
      ],
    },
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), "drawn");
  return result;
}

const evidence = (...args: string[]) =>
  project().run(
    "prototype",
    "evidence",
    "menu-button",
    "--actor",
    "design-agent",
    "--by",
    "frame",
    ...args,
  );

describe("evidence --by frame", () => {
  it("groups the contexts that point to one frame: what the design draws as one look", () => {
    expect(evidence("--table").stdout).toBe(
      [
        "| frame                    | profiles               | hover | focus   | menu   | contexts | stale |",
        "| ------------------------ | ---------------------- | ----- | ------- | ------ | -------- | ----- |",
        "| website.png#closedButton | phone, tablet-portrait | rest  | blurred | closed | 2        | 0     |",
        "| website.png#openButton   | phone                  | rest  | blurred | open   | 1        | 0     |",
        "",
        "No evidence: 1 context",
        "",
      ].join("\n"),
    );
  });

  it("prints the same as JSON, with each frame's provenance", () => {
    const result = json(evidence());
    expect(result.frames[0]).toEqual({
      file: design,
      frame: "closedButton",
      actor: "design-agent",
      at: ["2026-10-31T12:00:00Z"],
      fingerprints: [revision],
      profiles: [["phone"], ["tablet-portrait"]],
      states: { hover: ["rest"], focus: ["blurred"], menu: ["closed"] },
      contexts: 2,
      stale: 0,
    });
    expect(result.withoutEvidence).toBe(1);
  });

  it("counts stale contexts once the file changes", () => {
    const { run, root } = project();
    writeFileSync(join(root, design), "redrawn");
    const frames = json(
      run("prototype", "evidence", "menu-button", "--actor", "design-agent", "--by", "frame"),
    ).frames;
    expect(frames.map(({ stale }: { stale: number }) => stale)).toEqual([2, 1]);
  });
});
