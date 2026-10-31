import { afterAll, describe, expect, it } from "vitest";
import { cleanup } from "../support/project.js";
import { profiles, toolbarFiles } from "../support/toolbar.js";
import { cliProject } from "../support/workspace.js";

afterAll(cleanup);

const files = toolbarFiles;

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
      { name: "phone", values: profiles.phone },
      { name: "tablet-portrait", values: profiles["tablet-portrait"] },
      { name: "tablet-landscape", values: profiles["tablet-landscape"] },
      { name: "laptop", values: profiles.laptop },
      { name: "desktop", values: profiles.desktop },
    ]);
  });
});

describe("views and axes filter", () => {
  it("to one breakpoint, profile or shared state", () => {
    const { run } = cliProject(files);
    const views = (...args: string[]) => {
      const result = run("views", "toolbar", ...args);
      return result.code === 0 ? json(result).views : result.stderr;
    };
    expect([
      views("breakpoint=sm"),
      views("profile=desktop"),
      views("menu=open"),
      views("breakpoint=md"),
    ]).toEqual([
      [
        { breakpoint: "sm", keyboard: "no-keyboard", pointer: "touch", menu: "closed" },
        { breakpoint: "sm", keyboard: "no-keyboard", pointer: "touch", menu: "open" },
      ],
      [{ breakpoint: "xl", keyboard: "keyboard", pointer: "mouse" }],
      [
        { breakpoint: "base", keyboard: "no-keyboard", pointer: "touch", menu: "open" },
        { breakpoint: "sm", keyboard: "no-keyboard", pointer: "touch", menu: "open" },
      ],
      'dimensions: "md" is not a value of breakpoint (base, sm, lg, xl)\n',
    ]);
  });

  it("so axes says what a view accepts there", () => {
    const { run } = cliProject(files);
    const axes = (...args: string[]) => {
      const { node: _, ...rest } = json(run("axes", "toolbar", ...args));
      return rest;
    };
    expect([axes("breakpoint=lg"), axes("profile=phone")]).toEqual([
      {
        dimensions: [
          { name: "breakpoint", values: ["lg"] },
          { name: "keyboard", values: ["keyboard", "no-keyboard"] },
          { name: "pointer", values: ["mouse", "touch"] },
        ],
        shared: [],
        profiles: [
          { name: "tablet-landscape", values: profiles["tablet-landscape"] },
          { name: "laptop", values: profiles.laptop },
        ],
      },
      {
        dimensions: [
          { name: "breakpoint", values: ["base"] },
          { name: "keyboard", values: ["no-keyboard"] },
          { name: "pointer", values: ["touch"] },
        ],
        shared: [{ node: "menu", states: ["closed", "open"] }],
        profiles: [{ name: "phone", values: profiles.phone }],
      },
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

  it("name the profile in a failing exists rule", () => {
    const { run } = cliProject({
      ...files,
      "expectations.json": {
        version: 1,
        expectations: [
          {
            title: "The panel never exists",
            node: "menu-panel",
            when: { profile: "phone" },
            exists: false,
          },
        ],
      },
    });
    expect(run("validate").stderr.replace(/^.*?:\d+:\d+: /, "")).toBe(
      "expectation-failed: The panel never exists: menu-panel exists at phone (menu=open)\n",
    );
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
    const { run, read } = cliProject({
      ...files,
      "actors.json": { version: 1, actors: { agent: { checks: ["visual"] } } },
    });
    const result = run(
      "verify",
      "blog-link",
      "--check",
      "visual",
      "--result",
      "passed",
      "--actor",
      "agent",
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
      actor: "agent",
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
    snapshot.push(run("profile", "remove", "tablet-landscape").code);
    // phone is the only profile with breakpoint=base, which is then simply unused.
    snapshot.push(run("profile", "remove", "phone").code === 0);
    snapshot.push(json(run("profile", "list")).profiles.map(({ name }: { name: string }) => name));
    expect(snapshot).toEqual([
      0,
      { breakpoint: "lg", keyboard: "keyboard", pointer: "touch" },
      0,
      true,
      ["tablet-portrait", "laptop", "desktop", "tablet-keyboard"],
    ]);
  });

  it("add several profiles in one step, where one alone would break an expectation", () => {
    const { "profiles.json": _, ...without } = files;
    const { run, read } = cliProject({
      ...without,
      "expectations.json": {
        version: 1,
        expectations: [
          {
            title: "A phone shows the menu",
            node: "menu",
            when: { breakpoint: "base" },
            exists: true,
          },
          {
            title: "A desktop shows the links",
            node: "toolbar-links",
            when: { breakpoint: "xl" },
            exists: true,
          },
        ],
      },
    });
    const phone = ["phone", "breakpoint=base", "pointer=touch", "keyboard=no-keyboard"];
    const together = [
      "desktop",
      "breakpoint=xl",
      "pointer=mouse",
      "keyboard=keyboard",
      ...["tablet", "breakpoint=sm", "pointer=touch", "keyboard=no-keyboard"],
      ...["laptop", "breakpoint=lg", "pointer=mouse", "keyboard=keyboard"],
    ];
    const alone = run("profile", "add", ...phone);
    expect([alone.code, alone.stderr.includes("empty-expectation")]).toEqual([1, true]);
    expect(run("profile", "add", ...phone, ...together).code).toBe(0);
    expect(Object.keys(read("profiles.json").profiles as Record<string, unknown>)).toEqual([
      "phone",
      "desktop",
      "tablet",
      "laptop",
    ]);
  });

  it("need values for each profile they add", () => {
    const { run } = cliProject(files);
    expect(run("profile", "add", "watch", "tv", "breakpoint=xl").stderr).toContain(
      'give at least one <dimension>=<value> for profile "watch"',
    );
  });

  it("accept a combination that another profile already has", () => {
    const { run } = cliProject(files);
    expect(
      run("profile", "add", "ipad-keyboard", "breakpoint=lg", "pointer=mouse", "keyboard=keyboard")
        .code,
    ).toBe(0);
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

describe("dimension list", () => {
  it("shows the values no profile uses", () => {
    const { run } = cliProject({
      ...files,
      "profiles.json": {
        version: 1,
        profiles: { phone: profiles.phone, desktop: profiles.desktop },
      },
    });
    expect(
      json(run("dimension", "list")).dimensions.map(
        ({ name, inNoProfile }: { name: string; inNoProfile?: string[] }) => [name, inNoProfile],
      ),
    ).toEqual([
      ["breakpoint", ["sm", "lg"]],
      ["keyboard", undefined],
      ["pointer", undefined],
    ]);
  });
});
