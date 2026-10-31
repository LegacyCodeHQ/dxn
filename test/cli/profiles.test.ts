import { afterAll, describe, expect, it } from "vitest";
import { cleanup, rootFile } from "../support/project.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

// The neo-website toolbar, with five profiles: the combinations of screen
// size and input that real users have. None of the dimensions has a default.
const profiles = {
  phone: { breakpoint: "base", pointer: "touch", keyboard: "no-keyboard" },
  "tablet-portrait": { breakpoint: "sm", pointer: "touch", keyboard: "no-keyboard" },
  "tablet-landscape": { breakpoint: "lg", pointer: "touch", keyboard: "no-keyboard" },
  laptop: { breakpoint: "lg", pointer: "mouse", keyboard: "keyboard" },
  desktop: { breakpoint: "xl", pointer: "mouse", keyboard: "keyboard" },
};

const files = {
  "types.json": {
    version: 1,
    stateGroups: { hover: ["rest", "hovered"], focus: ["blurred", "focused"] },
    checks: { visual: {} },
    types: {
      link: { stateGroups: ["hover", "focus"], checks: ["visual"] },
      menu: { states: ["closed", "open"], shared: true },
    },
  },
  "fragments/toolbar.json": {
    version: 1,
    fragment: {
      id: "toolbar",
      title: "Toolbar",
      children: [
        { id: "wordmark", title: "Wordmark", type: "link" },
        {
          id: "toolbar-links",
          title: "Links",
          children: [{ id: "blog-link", title: "Blog link", type: "link" }],
        },
        {
          id: "menu",
          title: "Menu",
          type: "menu",
          children: [
            { id: "menu-button", title: "Menu button", type: "link" },
            {
              id: "menu-panel",
              title: "Menu panel",
              onlyWhen: { menu: ["open"] },
              children: [{ id: "menu-link", title: "Menu link", type: "link" }],
            },
          ],
        },
      ],
    },
  },
  "roots/page.json": rootFile({ id: "page", title: "Page", children: [{ include: "toolbar" }] }),
  "dimensions/breakpoint.json": {
    version: 1,
    values: ["base", "sm", "lg", "xl"],
    appliesTo: ["toolbar"],
  },
  "dimensions/pointer.json": { version: 1, values: ["mouse", "touch"], appliesTo: ["toolbar"] },
  "dimensions/keyboard.json": {
    version: 1,
    values: ["keyboard", "no-keyboard"],
    appliesTo: ["toolbar"],
  },
  "overrides/breakpoint.json": {
    version: 1,
    only: { "toolbar-links": ["lg", "xl"], menu: ["base", "sm"] },
    overrides: {},
  },
  "overrides/pointer.json": {
    version: 1,
    overrides: { touch: { types: { link: { states: { remove: ["hovered"] } } } } },
  },
  "overrides/keyboard.json": {
    version: 1,
    overrides: { "no-keyboard": { types: { link: { states: { remove: ["focused"] } } } } },
  },
  "profiles.json": { version: 1, profiles },
};

const json = (result: { stdout: string }) => JSON.parse(result.stdout);
const names = "desktop|laptop|phone|tablet-landscape|tablet-portrait";

describe("profiles limit the combinations", () => {
  it("to the ones a profile names", () => {
    const { run } = cliProject(files);
    expect(json(run("contexts", "toolbar", "--subtree", "--count")).counts).toEqual({
      toolbar: 5,
      wordmark: 11,
      "toolbar-links": 3,
      "blog-link": 9,
      menu: 4,
      "menu-button": 4,
      "menu-panel": 2,
      "menu-link": 2,
    });
    expect(json(run("views", "toolbar")).views).toEqual([
      { breakpoint: "base", keyboard: "no-keyboard", pointer: "touch", menu: "closed" },
      { breakpoint: "base", keyboard: "no-keyboard", pointer: "touch", menu: "open" },
      { breakpoint: "sm", keyboard: "no-keyboard", pointer: "touch", menu: "closed" },
      { breakpoint: "sm", keyboard: "no-keyboard", pointer: "touch", menu: "open" },
      { breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" },
      { breakpoint: "lg", keyboard: "no-keyboard", pointer: "touch" },
      { breakpoint: "xl", keyboard: "keyboard", pointer: "mouse" },
    ]);
  });

  it("and are listed by axes", () => {
    const { run } = cliProject(files);
    expect(json(run("axes", "toolbar")).profiles).toEqual([
      { name: "desktop", values: profiles.desktop },
      { name: "laptop", values: profiles.laptop },
      { name: "phone", values: profiles.phone },
      { name: "tablet-landscape", values: profiles["tablet-landscape"] },
      { name: "tablet-portrait", values: profiles["tablet-portrait"] },
    ]);
  });
});

describe("show and view fill in from a profile", () => {
  it("when exactly one profile fits, and ask otherwise", () => {
    const { run } = cliProject(files);
    const context = (...args: string[]) => {
      const result = run("show", "blog-link", ...args);
      return result.code === 0 ? json(result).context : result.stderr;
    };
    expect([
      context("profile=laptop"),
      context("breakpoint=xl"),
      context(),
      context("pointer=touch"),
      context("breakpoint=xl", "pointer=touch"),
      context("profile=phone", "breakpoint=lg"),
      context("profile=watch"),
    ]).toEqual([
      { breakpoint: "lg", keyboard: "keyboard", pointer: "mouse" },
      { breakpoint: "xl", keyboard: "keyboard", pointer: "mouse" },
      `dimensions: give profile=<${names}> for this node\n`,
      "dimensions: pointer=touch fits several profiles; give profile=<phone|tablet-landscape|tablet-portrait>\n",
      `dimensions: no profile has breakpoint=xl, pointer=touch (${names.replaceAll("|", ", ")})\n`,
      'dimensions: profile "phone" has breakpoint=base, not breakpoint=lg\n',
      `dimensions: "watch" is not a profile (${names.replaceAll("|", ", ")})\n`,
    ]);
  });

  it("in view, before asking for shared states", () => {
    const { run } = cliProject(files);
    expect([
      run("view", "toolbar").stderr,
      run("view", "toolbar", "profile=phone").stderr,
      json(run("view", "toolbar", "profile=phone", "menu=open")).context,
    ]).toEqual([
      `dimensions: give profile=<${names}> for this view\n`,
      "dimensions: give menu=<closed|open> for this view\n",
      { breakpoint: "base", keyboard: "no-keyboard", pointer: "touch", menu: "open" },
    ]);
  });
});

describe("filters by profile", () => {
  it("keep the contexts of that profile", () => {
    const { run } = cliProject(files);
    expect([
      json(run("contexts", "blog-link", "profile=laptop", "--count")).count,
      json(run("contexts", "wordmark", "profile=phone", "--count")).count,
      run("contexts", "wordmark", "profile=watch").stderr,
    ]).toEqual([
      4,
      1,
      `dimensions: "watch" is not a value of profile (${names.replaceAll("|", ", ")})\n`,
    ]);
  });

  it("work in expectations", () => {
    const { run } = cliProject({
      ...files,
      "expectations.json": {
        version: 1,
        expectations: [
          {
            title: "A laptop link has every state",
            node: "blog-link",
            when: { profile: "laptop" },
            some: { hover: "hovered", focus: "focused" },
          },
        ],
      },
    });
    expect(run("validate")).toMatchObject({ code: 0, stderr: "" });
  });
});

describe("verify", () => {
  it("records the profile's dimension values", () => {
    const { run, read } = cliProject(files);
    const result = run(
      "verify",
      "blog-link",
      "--check",
      "visual",
      "--result",
      "passed",
      "--by",
      "p",
      "--at",
      "2026-10-31T10:00:00Z",
      "profile=desktop",
      "hover=rest",
      "focus=blurred",
    );
    expect(result.code).toBe(0);
    expect((read("verification/page.json").records as unknown[])[0]).toEqual({
      node: "blog-link",
      context: {
        breakpoint: "xl",
        focus: "blurred",
        hover: "rest",
        keyboard: "keyboard",
        pointer: "mouse",
      },
      check: "visual",
      result: "passed",
      by: "p",
      at: "2026-10-31T10:00:00Z",
    });
    expect(json(run("status", "blog-link")).summary).toEqual({ passed: 1, failed: 0, missing: 8 });
  });
});

describe("profile commands", () => {
  it("add, list and remove profiles", () => {
    const { run, read } = cliProject(files);
    const snapshot: unknown[] = [];
    snapshot.push(
      run(
        "profile",
        "add",
        "tablet-keyboard",
        "breakpoint=lg",
        "pointer=touch",
        "keyboard=keyboard",
      ).code,
    );
    snapshot.push((read("profiles.json").profiles as Record<string, unknown>)["tablet-keyboard"]);
    snapshot.push(run("profile", "remove", "phone").code);
    snapshot.push(json(run("profile", "list")).profiles.map(({ name }: { name: string }) => name));
    expect(snapshot).toEqual([
      0,
      { breakpoint: "lg", keyboard: "keyboard", pointer: "touch" },
      0,
      ["desktop", "laptop", "tablet-keyboard", "tablet-landscape", "tablet-portrait"],
    ]);
  });

  it("refuse a combination that another profile already has", () => {
    const { run } = cliProject(files);
    const result = run(
      "profile",
      "add",
      "ipad-keyboard",
      "breakpoint=lg",
      "pointer=mouse",
      "keyboard=keyboard",
    );
    expect([result.code, result.stderr.includes("duplicate-profile")]).toEqual([1, true]);
  });

  it("follow a renamed dimension value", () => {
    const { run, read } = cliProject(files);
    expect(run("dimension", "rename-value", "breakpoint", "xl", "wide").code).toBe(0);
    expect(
      (read("profiles.json").profiles as Record<string, Record<string, string>>).desktop
        ?.breakpoint,
    ).toBe("wide");
  });
});
