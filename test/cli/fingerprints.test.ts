import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const design = "design.pen";

// A pen.dev document: a Button component colored by a variable, a cell that
// shows the button, a cell that shows text, and nothing else.
const pen = {
  version: "2.21",
  variables: {
    accent: { type: "color", value: "#0A7146" },
    ink: { type: "color", value: "#111513" },
  },
  children: [
    {
      type: "frame",
      id: "button",
      name: "Button",
      reusable: true,
      fill: "$accent",
      children: [{ type: "text", id: "label", content: "Menu", fill: "$ink" }],
    },
    {
      type: "frame",
      id: "buttonCell",
      name: "Cell · button",
      x: 0,
      y: 0,
      children: [{ type: "ref", id: "instance", ref: "button" }],
    },
    {
      type: "frame",
      id: "textCell",
      name: "Cell · text",
      x: 400,
      y: 0,
      children: [{ type: "text", id: "wordmark", content: "Legacy Code", fill: "$ink" }],
    },
  ],
};

// The design agent's frames for the closed menu button and the wordmark on a
// phone, at rest.
function project() {
  const result = cliProject({
    ...toolbarFiles,
    "actors.json": { version: 1, actors: { "design-agent": { evidence: "design" } } },
  });
  const write = (document: unknown) =>
    writeFileSync(join(result.root, design), JSON.stringify(document, null, 2));
  write(pen);
  const attach = (node: string, frame: string, ...context: string[]) =>
    result.run(
      "attach",
      node,
      "--actor",
      "design-agent",
      "--file",
      design,
      "--frame",
      frame,
      "profile=phone",
      "hover=rest",
      "focus=blurred",
      ...context,
    ).code;
  expect([
    attach("menu-button", "buttonCell", "menu=closed"),
    attach("wordmark", "textCell"),
  ]).toEqual([0, 0]);
  const edit = (change: (document: typeof pen) => void) => {
    const document = JSON.parse(readFileSync(join(result.root, design), "utf8"));
    change(document);
    write(document);
  };
  const states = () => {
    const status = json(result.run("status", "--actor", "design-agent"));
    const of = (node: string) =>
      status.items.find(
        (item: { node: string; evidence: string }) =>
          item.node === node && item.evidence !== "missing",
      )?.evidence;
    return { button: of("menu-button"), text: of("wordmark") };
  };
  return { ...result, edit, states };
}

describe("evidence in a pen.dev file", () => {
  it("stays present when a frame it does not point to is added", () => {
    const { edit, states } = project();
    edit((document) => {
      document.children.push({
        type: "frame",
        id: "scratch",
        name: "Scratch",
        x: 800,
        y: 0,
        children: [],
      });
    });
    expect(states()).toEqual({ button: "present", text: "present" });
  });

  it("is stale when a component its frame uses changes, and only that frame", () => {
    const { edit, states } = project();
    edit((document) => {
      (document.children[0] as Record<string, unknown>).cornerRadius = 10;
    });
    expect(states()).toEqual({ button: "stale", text: "present" });
  });

  it("is stale when a variable its frame uses changes", () => {
    const { edit, states } = project();
    edit((document) => {
      document.variables.accent.value = "#13965C";
    });
    expect(states()).toEqual({ button: "stale", text: "present" });
  });

  it("stays present when its frame moves on the canvas", () => {
    const { edit, states } = project();
    edit((document) => {
      Object.assign(document.children[1] as Record<string, unknown>, { x: 1200, y: 600 });
    });
    expect(states()).toEqual({ button: "present", text: "present" });
  });

  it("is gone when its frame is deleted, which is not an error", () => {
    const { edit, run } = project();
    edit((document) => {
      document.children.splice(2, 1);
    });
    expect(run("validate").code).toBe(0);
    expect(
      json(run("evidence", "wordmark", "--actor", "design-agent")).contexts[0].evidence[0],
    ).toMatchObject({ stale: true, gone: true });
    expect(run("evidence", "wordmark", "--actor", "design-agent", "--table").stdout).toContain(
      "design.pen#textCell (gone)",
    );
  });

  it("refuses a frame the file does not have", () => {
    const { run } = project();
    expect(
      run(
        "attach",
        "wordmark",
        "--actor",
        "design-agent",
        "--file",
        design,
        "--frame",
        "nope",
        "profile=phone",
        "hover=rest",
        "focus=blurred",
      ).stderr,
    ).toBe('dxn: frame "nope" is not in design.pen\n');
  });
});
