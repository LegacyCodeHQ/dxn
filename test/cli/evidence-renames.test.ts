import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const design = "design/website.pen";
const drawn = "the toolbar, drawn";
const revision = createHash("sha1")
  .update(`blob ${Buffer.byteLength(drawn)}\0${drawn}`)
  .digest("hex");

const entry = {
  node: "menu-button",
  context: {
    breakpoint: "base",
    keyboard: "no-keyboard",
    pointer: "touch",
    menu: "closed",
    hover: "rest",
    focus: "blurred",
  },
  actor: "design-agent",
  at: "2026-10-31T12:00:00Z",
  source: { file: design, frame: "vbGba" },
  revision,
};

function project() {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
    "evidence/page.json": { version: 1, evidence: [entry] },
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), drawn);
  return result;
}

const first = (read: (name: string) => Record<string, unknown>, file = "evidence/page.json") =>
  (read(file).evidence as Record<string, unknown>[])[0];

describe("renames update evidence", () => {
  it("node rename: the node an entry is for", () => {
    const { run, read } = project();
    expect(run("node", "rename", "menu-button", "toggle").code).toBe(0);
    expect(first(read)?.node).toBe("toggle");
  });

  it("node rename: a shared node's state in an entry's context", () => {
    const { run, read } = project();
    expect(run("node", "rename", "menu", "nav-menu").code).toBe(0);
    expect(first(read)?.context).toMatchObject({ "nav-menu": "closed" });
  });

  it("node rename: a root, whose evidence file moves with it", () => {
    const { run, read, exists } = project();
    expect(run("node", "rename", "page", "site").code).toBe(0);
    expect([exists("evidence/page.json"), first(read, "evidence/site.json")?.node]).toEqual([
      false,
      "menu-button",
    ]);
  });

  it("dimension rename-value: a dimension's value in an entry's context", () => {
    const { run, read } = project();
    expect(run("dimension", "rename-value", "breakpoint", "base", "xs").code).toBe(0);
    expect(first(read)?.context).toMatchObject({ breakpoint: "xs" });
  });

  it("state-group rename-value: a state in an entry's context", () => {
    const { run, read } = project();
    expect(run("state-group", "rename-value", "hover", "rest", "idle").code).toBe(0);
    expect(first(read)?.context).toMatchObject({ hover: "idle" });
  });
});
