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
const revision = createHash("sha1").update(`blob 5\0drawn`).digest("hex");

function project() {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
    "evidence/page.json": {
      version: 1,
      evidence: [
        {
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
          fingerprint: revision,
        },
      ],
    },
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), "drawn");
  return result;
}

describe("evidence filters", () => {
  it("keep the contexts with those values, states or profiles", () => {
    const { run } = project();
    const rows = (...filters: string[]) =>
      json(run("evidence", "menu-button", "--actor", "design-agent", ...filters)).contexts.map(
        ({ context }: { context: { breakpoint: string; menu: string } }) =>
          `${context.breakpoint}/${context.menu}`,
      );
    expect([rows("profile=phone"), rows("menu=open"), rows("profile=phone", "menu=open")]).toEqual([
      ["base/closed", "base/open"],
      ["base/open", "sm/open"],
      ["base/open"],
    ]);
    expect(run("evidence", "menu-button", "--actor", "design-agent", "theme=dark").code).toBe(1);
  });
});

describe("status --actor", () => {
  it("reports each context of each node as present, stale or missing for the actor", () => {
    const { run, root } = project();
    const result = json(run("status", "menu-button", "--actor", "design-agent"));
    expect(result.summary).toEqual({ present: 1, stale: 0, conflicting: 0, missing: 3 });
    expect(result.items[0]).toEqual({
      root: "page",
      node: "menu-button",
      context: {
        breakpoint: "base",
        keyboard: "no-keyboard",
        pointer: "touch",
        menu: "closed",
        hover: "rest",
        focus: "blurred",
      },
      evidence: "present",
    });
    writeFileSync(join(root, design), "redrawn");
    expect(json(run("status", "menu-button", "--actor", "design-agent")).summary).toEqual({
      present: 0,
      stale: 1,
      conflicting: 0,
      missing: 3,
    });
  });

  it("covers every node without a node id, and refuses an undeclared actor", () => {
    const { run } = project();
    const all = json(run("status", "--actor", "design-agent"));
    expect(new Set(all.items.map(({ node }: { node: string }) => node)).has("wordmark")).toBe(true);
    expect(run("status", "--actor", "designer").stderr).toBe(
      'dimensions: actor not found: "designer" (design-agent)\n',
    );
  });
});
