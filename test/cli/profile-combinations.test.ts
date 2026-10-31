import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { profiles, toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

// An iPad with a keyboard and trackpad, in portrait (sm) or landscape (lg).
// Landscape is the same combination as laptop.
const ipadKeyboard = [
  { breakpoint: "sm", pointer: "mouse", keyboard: "keyboard" },
  { breakpoint: "lg", pointer: "mouse", keyboard: "keyboard" },
];

const files = {
  ...toolbarFiles,
  "profiles.json": { version: 1, profiles: { ...profiles, "ipad-keyboard": ipadKeyboard } },
  "actors.json": { version: 1, actors: { "design-agent": {} } },
};

function problems(extra: Record<string, unknown>): string[] {
  return cliProject({
    ...toolbarFiles,
    "profiles.json": { version: 1, profiles: { ...profiles, ...extra } },
  })
    .run("validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));
}

describe("a profile with several combinations", () => {
  it("compiles, and may share a combination with another profile", () => {
    expect(problems({ "ipad-keyboard": ipadKeyboard })).toEqual([]);
  });

  it("lists each combination once, each with every dimension, and at least one", () => {
    expect([
      problems({ "ipad-keyboard": [ipadKeyboard[0], ipadKeyboard[0]] }),
      problems({ "ipad-keyboard": [{ breakpoint: "sm", pointer: "mouse" }] }),
      problems({ "ipad-keyboard": [] }),
    ]).toEqual([
      ['duplicate-profile: profile "ipad-keyboard" lists the same combination twice'],
      [
        'incomplete-profile: profile "ipad-keyboard" does not give keyboard, which other profiles give',
      ],
      ["empty-values: a profile lists at least one combination"],
    ]);
  });

  it("adds the contexts of each combination", () => {
    const { run } = cliProject(files);
    expect(json(run("contexts", "menu-button", "profile=ipad-keyboard", "--count")).count).toBe(8);
    expect(json(run("contexts", "menu-button", "--table", "--json")).tables[0]).toEqual({
      group: "hover",
      rows: [
        { row: "phone", values: { rest: true, hovered: false } },
        { row: "tablet-portrait", values: { rest: true, hovered: false } },
        { row: "ipad-keyboard", values: { rest: true, hovered: true } },
      ],
    });
  });

  it("names every profile on a shared combination", () => {
    const { run } = cliProject(files);
    expect(
      json(run("contexts", "blog-link", "--table", "--json")).tables[0].rows.map(
        ({ row }: { row: string }) => row,
      ),
    ).toEqual(["tablet-landscape", "laptop / ipad-keyboard", "desktop"]);
    expect(run("contexts", "menu-button", "--table").stdout).toContain(
      "Not present: tablet-landscape, laptop / ipad-keyboard, desktop",
    );
    expect(run("views", "toolbar", "breakpoint=lg", "--table").stdout).toContain(
      "| laptop / ipad-keyboard | lg         | keyboard    | mouse   |",
    );
    expect(
      json(run("evidence", "blog-link", "--actor", "design-agent")).contexts.find(
        ({ context }: { context: { breakpoint: string; pointer: string } }) =>
          context.breakpoint === "lg" && context.pointer === "mouse",
      )?.profiles,
    ).toEqual(["laptop", "ipad-keyboard"]);
  });

  it("fills in values only when its combinations agree, and asks otherwise", () => {
    const { run } = cliProject(files);
    expect([
      run("show", "blog-link", "profile=ipad-keyboard").stderr,
      json(run("show", "blog-link", "profile=ipad-keyboard", "breakpoint=lg")).context,
      json(run("show", "blog-link", "breakpoint=lg", "pointer=mouse")).context,
    ]).toEqual([
      'dimensions: profile "ipad-keyboard" has several combinations; give breakpoint=<sm|lg>\n',
      { breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" },
      { breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" },
    ]);
  });

  it("is named in a failing expectation", () => {
    const result = cliProject({
      ...files,
      "expectations.json": {
        version: 1,
        expectations: [
          {
            title: "Wide screens never hover",
            node: "blog-link",
            when: { breakpoint: "lg" },
            then: { hover: "rest" },
          },
        ],
      },
    }).run("validate");
    expect(result.stderr).toContain("blog-link at laptop / ipad-keyboard");
  });
});

describe("profile add", () => {
  it("writes a list for values joined with |, one combination for each", () => {
    const { run, read } = cliProject(toolbarFiles);
    expect(
      run(
        "profile",
        "add",
        "ipad-keyboard",
        "breakpoint=sm|lg",
        "pointer=mouse",
        "keyboard=keyboard",
      ).code,
    ).toBe(0);
    expect((read("profiles.json").profiles as Record<string, unknown>)["ipad-keyboard"]).toEqual([
      { breakpoint: "sm", keyboard: "keyboard", pointer: "mouse" },
      { breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" },
    ]);
    expect(
      json(run("profile", "list")).profiles.find(
        ({ name }: { name: string }) => name === "ipad-keyboard",
      ),
    ).toEqual({
      name: "ipad-keyboard",
      combinations: [
        { breakpoint: "sm", keyboard: "keyboard", pointer: "mouse" },
        { breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" },
      ],
    });
  });
});
