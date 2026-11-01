import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { profiles, toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const design = "design/website.png";

// The toolbar with a magic keyboard on tablets, and the design agent's frame
// for the menu button at rest on a phone with the menu closed.
function project() {
  const result = cliProject({
    ...toolbarFiles,
    "profiles.json": {
      version: 1,
      profiles,
      modifiers: {
        "magic-keyboard": {
          on: ["tablet-portrait", "tablet-landscape"],
          sets: { pointer: "mouse", keyboard: "keyboard" },
        },
      },
    },
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
          fingerprint: createHash("sha1").update("blob 5\0drawn").digest("hex"),
        },
      ],
    },
  });
  mkdirSync(join(result.root, "design"), { recursive: true });
  writeFileSync(join(result.root, design), "drawn");
  return result;
}

const evidence = (...args: string[]) =>
  project().run("prototype", "evidence", "menu-button", "--actor", "design-agent", ...args);

describe("evidence --by profile", () => {
  it("prints a row per profile: its states, and how many contexts have evidence", () => {
    expect(evidence("--table", "--by", "profile").stdout).toBe(
      [
        "| profile                        | hover         | focus            | menu         | contexts | present | stale | missing |",
        "| ------------------------------ | ------------- | ---------------- | ------------ | -------- | ------- | ----- | ------- |",
        "| phone                          | rest          | blurred          | closed, open | 2        | 1       | 0     | 1       |",
        "| tablet-portrait                | rest          | blurred          | closed, open | 2        | 0       | 0     | 2       |",
        "| tablet-portrait+magic-keyboard | rest, hovered | blurred, focused | closed, open | 8        | 0       | 0     | 8       |",
        "",
        "Not present: tablet-landscape, laptop / tablet-landscape+magic-keyboard, desktop",
        "",
      ].join("\n"),
    );
  });

  it("prints the same as JSON", () => {
    const result = json(evidence("--by", "profile"));
    expect(result.rows[2]).toEqual({
      profiles: ["tablet-portrait+magic-keyboard"],
      states: {
        hover: ["rest", "hovered"],
        focus: ["blurred", "focused"],
        menu: ["closed", "open"],
      },
      contexts: 8,
      present: 0,
      stale: 0,
      conflicting: 0,
      missing: 8,
    });
    expect(result.notPresent).toEqual([
      ["tablet-landscape"],
      ["laptop", "tablet-landscape+magic-keyboard"],
      ["desktop"],
    ]);
  });

  it("takes only profile, frame or look", () => {
    expect(evidence("--table", "--by", "breakpoint").stderr).toBe(
      'dxn: --by takes "profile", "frame" or "look" here\n',
    );
  });
});

describe("evidence --table", () => {
  it("puts its rows in profile order", () => {
    const rows = evidence("--table")
      .stdout.split("\n")
      .slice(2, -1)
      .map((line) => line.split("|")[1]?.trim());
    expect([...new Set(rows)]).toEqual([
      "phone",
      "tablet-portrait",
      "tablet-portrait+magic-keyboard",
    ]);
  });
});

describe("evidence --missing", () => {
  it("keeps only the contexts without evidence that is present", () => {
    const result = json(evidence("--missing"));
    expect(result.contexts).toHaveLength(11);
    expect(
      result.contexts.some(
        ({ context }: { context: { breakpoint: string; menu: string } }) =>
          context.breakpoint === "base" && context.menu === "closed",
      ),
    ).toBe(false);
  });

  it("counts stale evidence as missing, since it needs another look", () => {
    const { run, root } = project();
    writeFileSync(join(root, design), "redrawn");
    expect(
      json(run("prototype", "evidence", "menu-button", "--actor", "design-agent", "--missing"))
        .contexts,
    ).toHaveLength(12);
  });

  it("with --by profile, lists per profile the states still to cover", () => {
    expect(evidence("--missing", "--by", "profile", "--table").stdout.split("\n")).toEqual([
      "| profile                        | hover         | focus            | menu         | contexts | present | stale | missing |",
      "| ------------------------------ | ------------- | ---------------- | ------------ | -------- | ------- | ----- | ------- |",
      "| phone                          | rest          | blurred          | open         | 1        | 0       | 0     | 1       |",
      "| tablet-portrait                | rest          | blurred          | closed, open | 2        | 0       | 0     | 2       |",
      "| tablet-portrait+magic-keyboard | rest, hovered | blurred, focused | closed, open | 8        | 0       | 0     | 8       |",
      "",
      "Not present: tablet-landscape, laptop / tablet-landscape+magic-keyboard, desktop",
      "",
    ]);
  });
});
