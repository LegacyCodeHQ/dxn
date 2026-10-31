import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { profiles, toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const json = (result: { stdout: string }) => JSON.parse(result.stdout);

// A keyboard with a trackpad, attached to a tablet in either orientation.
const magicKeyboard = {
  on: ["tablet-portrait", "tablet-landscape"],
  sets: { pointer: "mouse", keyboard: "keyboard" },
};

const files = {
  ...toolbarFiles,
  "profiles.json": { version: 1, profiles, modifiers: { "magic-keyboard": magicKeyboard } },
  "actors.json": { version: 1, actors: { "design-agent": {} } },
};

function problems(modifier: unknown, extra: Record<string, unknown> = {}): string[] {
  return cliProject({
    ...toolbarFiles,
    "profiles.json": { version: 1, profiles, modifiers: { "magic-keyboard": modifier } },
    ...extra,
  })
    .run("validate")
    .stderr.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace(/^.*?:\d+:\d+: /, ""));
}

describe("a modifier", () => {
  it("compiles when it changes listed profiles' values", () => {
    expect(problems(magicKeyboard)).toEqual([]);
  });

  it("names profiles, and declared dimensions the profiles give, and changes something", () => {
    expect([
      problems({ ...magicKeyboard, on: ["watch"] }),
      problems({ ...magicKeyboard, sets: { theme: "dark" } }),
      problems({ ...magicKeyboard, sets: { pointer: "pen" } }),
      problems(
        { ...magicKeyboard, sets: { theme: "dark" } },
        {
          "dimensions/theme.json": {
            version: 1,
            values: ["light", "dark"],
            appliesTo: ["toolbar"],
          },
        },
      ),
      problems({ on: ["laptop"], sets: { pointer: "mouse" } }),
      problems({ on: [], sets: { pointer: "mouse" } }),
    ]).toEqual([
      ['unknown-profile: "watch" is not a profile'],
      ['undeclared-dimension: dimension "theme" is not declared'],
      ['unknown-dimension-value: "pen" is not a value of dimension "pointer"'],
      ['unprofiled-dimension: profiles do not give "theme", so a modifier cannot set it'],
      ['modifier-changes-nothing: modifier "magic-keyboard" changes nothing on profile "laptop"'],
      ["empty-values: a modifier is on at least one profile"],
    ]);
  });

  it("adds a profile for each one it is on, named after both", () => {
    const { run } = cliProject(files);
    expect(
      json(run("contexts", "menu-button", "profile=tablet-portrait+magic-keyboard", "--count"))
        .count,
    ).toBe(8);
    expect(json(run("contexts", "menu-button", "profile=tablet-portrait", "--count")).count).toBe(
      2,
    );
    expect(json(run("contexts", "menu-button", "--table", "--json")).tables[0]).toEqual({
      group: "hover",
      rows: [
        { row: "phone", values: { rest: true, hovered: false } },
        { row: "tablet-portrait", values: { rest: true, hovered: false } },
        { row: "tablet-portrait+magic-keyboard", values: { rest: true, hovered: true } },
      ],
    });
  });

  it("can give a combination another profile has, and rows name both", () => {
    const { run } = cliProject(files);
    const shared = "laptop / tablet-landscape+magic-keyboard";
    expect(
      json(run("contexts", "blog-link", "--table", "--json")).tables[0].rows.map(
        ({ row }: { row: string }) => row,
      ),
    ).toEqual(["tablet-landscape", shared, "desktop"]);
    expect(run("views", "toolbar", "breakpoint=lg", "--table").stdout).toContain(`| ${shared} |`);
    expect(
      json(run("evidence", "blog-link", "--actor", "design-agent")).contexts.find(
        ({ context }: { context: { breakpoint: string; pointer: string } }) =>
          context.breakpoint === "lg" && context.pointer === "mouse",
      )?.profiles,
    ).toEqual(["laptop", "tablet-landscape+magic-keyboard"]);
    expect(
      json(run("show", "blog-link", "profile=tablet-landscape+magic-keyboard")).context,
    ).toEqual({ breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" });
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
    expect(result.stderr).toContain("blog-link at laptop / tablet-landscape+magic-keyboard");
  });
});

describe("modifier commands", () => {
  it("add, list and remove modifiers in profiles.json", () => {
    const { run, read } = cliProject(toolbarFiles);
    expect(
      run(
        "modifier",
        "add",
        "magic-keyboard",
        "--on",
        "tablet-portrait,tablet-landscape",
        "pointer=mouse",
        "keyboard=keyboard",
      ).code,
    ).toBe(0);
    expect(read("profiles.json").modifiers).toEqual({
      "magic-keyboard": {
        on: ["tablet-portrait", "tablet-landscape"],
        sets: { keyboard: "keyboard", pointer: "mouse" },
      },
    });
    expect(json(run("modifier", "list"))).toEqual({
      modifiers: [
        {
          name: "magic-keyboard",
          on: ["tablet-portrait", "tablet-landscape"],
          sets: { keyboard: "keyboard", pointer: "mouse" },
        },
      ],
    });
    expect(run("modifier", "add", "magic-keyboard", "--on", "phone", "pointer=mouse").stderr).toBe(
      'dimensions: modifier "magic-keyboard" already exists\n',
    );
    expect(run("modifier", "remove", "magic-keyboard").code).toBe(0);
    expect(read("profiles.json").modifiers).toBeUndefined();
  });
});

describe("profile remove", () => {
  it("takes the profile out of modifiers, and removes a modifier left on none", () => {
    const { run, read } = cliProject({
      ...toolbarFiles,
      "profiles.json": {
        version: 1,
        profiles,
        modifiers: {
          "magic-keyboard": magicKeyboard,
          pencil: { on: ["tablet-portrait"], sets: { pointer: "mouse" } },
        },
      },
    });
    expect(run("profile", "remove", "tablet-portrait").code).toBe(0);
    expect(read("profiles.json").modifiers).toEqual({
      "magic-keyboard": { on: ["tablet-landscape"], sets: magicKeyboard.sets },
    });
  });
});
