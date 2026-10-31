import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const design = "design.pen";

// Links are small, and large on desktops; a focus ring shows when focused.
// Hover changes nothing a link looks like.
const base = toolbarFiles["types.json"];
const types = {
  ...base,
  attributes: { size: { values: ["small", "large"] }, ring: { values: ["none", "focus"] } },
  types: {
    ...base.types,
    link: {
      ...base.types.link,
      attributes: {
        size: { rest: "small", hovered: "small" },
        ring: { blurred: "none", focused: "focus" },
      },
    },
  },
};

const files = {
  ...toolbarFiles,
  "types.json": types,
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {
      xl: { types: { link: { attributes: { size: { rest: "large", hovered: "large" } } } } },
    },
  },
  "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
};

const pen = {
  version: "2.21",
  children: ["laptopRest", "desktopRest"].map((id, index) => ({
    type: "frame",
    id,
    name: id,
    x: index * 400,
    y: 0,
    children: [],
  })),
};

function project() {
  const result = cliProject(files);
  writeFileSync(join(result.root, design), JSON.stringify(pen));
  const attach = (frame: string, ...context: string[]) =>
    result.run("attach", "wordmark", "--file", design, "--frame", frame, ...context);
  return { ...result, attach };
}

describe("a frame", () => {
  it("may cover contexts that look alike: hover changes nothing here", () => {
    const { attach, run } = project();
    expect(attach("laptopRest", "profile=laptop", "hover=rest|hovered", "focus=blurred").code).toBe(
      0,
    );
    expect(run("validate").code).toBe(0);
  });

  it("may not cover contexts the model says look different", () => {
    const { attach } = project();
    expect(
      attach("laptopRest", "profile=laptop|desktop", "hover=rest", "focus=blurred").stderr.replace(
        /^.*?:\d+:\d+: /,
        "",
      ),
    ).toBe(
      'different-looks: frame "laptopRest" covers wordmark contexts that look different: size is small in one and large in another\n',
    );
  });
});

describe("evidence --by look", () => {
  it("groups the contexts by what they look like, with the frames that cover each look", () => {
    const { attach, run } = project();
    attach("laptopRest", "profile=laptop", "hover=rest|hovered", "focus=blurred");
    expect(run("evidence", "wordmark", "--by", "look", "--table").stdout).toBe(
      [
        "| size  | ring  | profiles                                         | contexts | frames                | missing |",
        "| ----- | ----- | ------------------------------------------------ | -------- | --------------------- | ------- |",
        "| small | none  | phone, tablet-portrait, tablet-landscape, laptop | 5        | design.pen#laptopRest | 3       |",
        "| small | focus | laptop                                           | 2        | —                     | 2       |",
        "| large | none  | desktop                                          | 2        | —                     | 2       |",
        "| large | focus | desktop                                          | 2        | —                     | 2       |",
        "",
      ].join("\n"),
    );
    expect(json(run("evidence", "wordmark", "--by", "look")).looks[0]).toEqual({
      attributes: { size: "small", ring: "none" },
      profiles: [["phone"], ["tablet-portrait"], ["tablet-landscape"], ["laptop"]],
      contexts: 5,
      frames: [{ file: design, frame: "laptopRest", name: "laptopRest" }],
      present: 2,
      stale: 0,
      missing: 3,
    });
  });

  it("asks for attributes when the node's type declares none", () => {
    const { run } = cliProject({
      ...toolbarFiles,
      "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
    });
    expect(run("evidence", "wordmark", "--by", "look").stderr).toBe(
      "dimensions: wordmark has no attributes, so every context looks alike; give its type attributes to tell its looks apart\n",
    );
  });
});
