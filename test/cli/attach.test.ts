import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const design = "design/website.pen";
const revisionOf = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");

function project() {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), "drawn");
  return result;
}

const at = "2026-10-31T12:00:00Z";
const attach = (...context: string[]) => [
  "attach",
  "menu",
  "--actor",
  "design-agent",
  "--file",
  design,
  "--frame",
  "vbGba",
  "--at",
  at,
  ...context,
];
const closedOnPhone = {
  breakpoint: "base",
  keyboard: "no-keyboard",
  pointer: "touch",
  menu: "closed",
};

describe("attach", () => {
  it("records evidence for a node in one context, with the file's revision", () => {
    const { run, read } = project();
    expect(run(...attach("profile=phone", "menu=closed")).code).toBe(0);
    expect(read("evidence/page.json")).toEqual({
      version: 1,
      evidence: [
        {
          node: "menu",
          context: closedOnPhone,
          actor: "design-agent",
          at,
          source: { file: design, frame: "vbGba" },
          revision: revisionOf("drawn"),
        },
      ],
    });
  });

  it("replaces the entry for the same node, context, actor and frame, so it is no longer stale", () => {
    const { run, read, root } = project();
    run(...attach("profile=phone", "menu=closed"));
    writeFileSync(join(root, design), "redrawn");
    expect(run(...attach("profile=phone", "menu=closed")).code).toBe(0);
    const entries = read("evidence/page.json").evidence as { revision: string }[];
    expect(entries.map(({ revision }) => revision)).toEqual([revisionOf("redrawn")]);
  });

  it("refuses an incomplete context, a missing file and missing options", () => {
    const { run } = project();
    expect([
      run(...attach("profile=phone")).stderr.replace(/^.*?:\d+:\d+: /, ""),
      run(
        "attach",
        "menu",
        "--actor",
        "design-agent",
        "--file",
        "design/missing.pen",
        "--frame",
        "x",
        "profile=phone",
        "menu=closed",
      ).stderr,
      run("attach", "menu", "--actor", "design-agent", "profile=phone").stderr.split("\n")[0],
    ]).toEqual([
      'unknown-context: menu has no such context in root "page"; "dimensions evidence menu --actor <name>" lists them\n',
      'dimensions: "design/missing.pen" does not exist in the repository\n',
      "dimensions: --actor, --file and --frame are required",
    ]);
  });
});

describe("detach", () => {
  it("removes the entry, and refuses one that is not there", () => {
    const { run, read } = project();
    run(...attach("profile=phone", "menu=closed"));
    const detach = [
      "detach",
      "menu",
      "--actor",
      "design-agent",
      "--frame",
      "vbGba",
      "profile=phone",
      "menu=closed",
    ];
    expect(run(...detach).code).toBe(0);
    expect(read("evidence/page.json").evidence).toEqual([]);
    expect(run(...detach).stderr).toBe(
      'dimensions: no evidence from design-agent for menu in frame "vbGba" in {"breakpoint":"base","keyboard":"no-keyboard","menu":"closed","pointer":"touch"}\n',
    );
  });
});

describe("attach with lists", () => {
  const listed = (...context: string[]) => {
    const result = project();
    const run = result.run(
      "attach",
      "wordmark",
      "--actor",
      "design-agent",
      "--file",
      design,
      "--frame",
      "wide",
      "--at",
      at,
      ...context,
    );
    return { ...result, run };
  };
  const recorded = (read: (name: string) => Record<string, unknown>) =>
    (read("evidence/page.json").evidence as { context: Record<string, string> }[]).map(
      ({ context }) => `${context.breakpoint}/${context.pointer}/${context.hover}/${context.focus}`,
    );

  it("records every combination that is a context of the node, once each", () => {
    const { run, read } = listed(
      "profile=tablet-landscape|laptop|desktop",
      "hover=rest|hovered",
      "focus=blurred",
    );
    expect(run.code).toBe(0);
    expect(recorded(read)).toEqual([
      "lg/touch/rest/blurred",
      "lg/mouse/rest/blurred",
      "lg/mouse/hovered/blurred",
      "xl/mouse/rest/blurred",
      "xl/mouse/hovered/blurred",
    ]);
  });

  it("refuses a listed value the node never has, and writes nothing", () => {
    const { run, exists } = listed("profile=laptop", "hover=rest|hovred", "focus=blurred");
    expect([run.stderr, exists("evidence/page.json")]).toEqual([
      'dimensions: "hovred" is not a value of hover for wordmark (rest, hovered)\n',
      false,
    ]);
  });

  it("refuses lists where no combination is a context", () => {
    const { run } = listed("profile=phone|tablet-portrait", "hover=hovered", "focus=blurred");
    expect(run.stderr).toBe(
      'dimensions: no context of wordmark matches; "dimensions evidence wordmark --actor design-agent" lists them\n',
    );
  });
});
