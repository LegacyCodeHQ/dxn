import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { reviewFolder } from "../../src/commands/review.js";
import { capture } from "../support/cli.js";
import { cleanup, writeProject } from "../support/project.js";

afterAll(cleanup);

const schema = `enum Style = filled | plain
type Button {
  state style: Style
}

record Evidence {
  source: PenNode
}
actor Designer records Evidence
`;

// A pen.dev file: a frame holding the button's two styles, each a node with
// its fill.
const pen = (filled: string) =>
  JSON.stringify({
    version: "2.21",
    children: [
      {
        id: "states",
        type: "frame",
        name: "Button states",
        children: [
          { id: "filled", type: "frame", name: "filled", fill: filled },
          { id: "plain", type: "frame", name: "plain", fill: "#FFFFFF" },
        ],
      },
    ],
  });

// A repository with the model in spec/ and its design, the filled button's
// evidence attached, and its picture exported beside the evidence.
function project(model = schema, ...where: string[]) {
  const root = writeProject({ "spec/button.dxn": model, "design/button.pen": pen("#B3261E") });
  mkdirSync(join(root, ".git"));
  // The cache, outside the repository.
  const cache = writeProject({});
  const shown = (text: string) =>
    text.replaceAll(cache, "<cache>").replace(/review\/[^/]+\//g, "review/<repository>/");
  const run = (...args: string[]) => {
    const result = capture(args, root, cache);
    return { ...result, stdout: shown(result.stdout) };
  };
  const attached = run(
    "attach",
    "spec/button.dxn",
    ...(where.length > 0 ? where : ["Button"]),
    "--actor",
    "Designer",
    "--data",
    JSON.stringify({ source: { file: "design/button.pen", frame: "states", node: "filled" } }),
    "style=filled",
  );
  expect(attached.code).toBe(0);
  // The pictures and the pages, in the cache.
  const folder = reviewFolder(cache, join(root, "spec", "button.dxn"), "Evidence");
  mkdirSync(join(folder, "pictures"), { recursive: true });
  writeFileSync(join(folder, "pictures", "filled.png"), "a picture");
  const page = (name = "button.md") => readFileSync(join(folder, name), "utf8");
  return { root, run, page, folder };
}

describe("dxn review", () => {
  it("writes, for each tree, a page of its combinations, each with its status and picture", () => {
    const { run, page } = project();
    const result = run("review", "spec/button.dxn");
    expect([result.code, result.stdout, result.stderr]).toEqual([
      0,
      "Wrote <cache>/review/<repository>/spec/evidence/button.md\n",
      "",
    ]);
    expect(page()).toMatchInlineSnapshot(`
      "# Button

      Written by \`dxn review\` from the stored Evidence of \`spec/button.dxn\`; run it again rather than edit this page.

      Evidence for 1 of 2 combinations.

      | style | status | as recorded |
      | --- | --- | --- |
      | filled |  | ![Button: style = filled](pictures/filled.png) |
      | plain | **missing** | — |
      "
    `);
  });

  it("leaves out the status where every combination is present, and leaves a present one's blank", () => {
    const { run, page } = project();
    run(
      "attach",
      "spec/button.dxn",
      "Button",
      "--actor",
      "Designer",
      "--data",
      JSON.stringify({ source: { file: "design/button.pen", frame: "states", node: "plain" } }),
      "style=plain",
    );
    expect(run("review", "spec/button.dxn").code).toBe(0);
    expect(page()).toContain(
      [
        "| style | as recorded |",
        "| --- | --- |",
        "| filled | ![Button: style = filled](pictures/filled.png) |",
        "| plain | no picture |",
      ].join("\n"),
    );
  });

  it("marks a combination whose drawing changed since it was recorded stale, with its picture as recorded", () => {
    const { root, run, page } = project();
    writeFileSync(join(root, "design", "button.pen"), pen("#000000"));
    expect(run("review", "spec/button.dxn").code).toBe(0);
    expect(page()).toMatchInlineSnapshot(`
      "# Button

      Written by \`dxn review\` from the stored Evidence of \`spec/button.dxn\`; run it again rather than edit this page.

      Evidence for 0 of 2 combinations; 1 stale.

      | style | status | as recorded |
      | --- | --- | --- |
      | filled | **stale** | ![Button: style = filled](pictures/filled.png) |
      | plain | **missing** | — |
      "
    `);
  });

  it("says when a recorded combination has no picture", () => {
    const { run, page, folder } = project();
    rmSync(join(folder, "pictures", "filled.png"));
    expect(run("review", "spec/button.dxn").code).toBe(0);
    expect(page()).toContain("| filled |  | no picture |");
  });

  it("gives an element in place its own section, with the states of the parents that place it", () => {
    const { run, page } = project(
      `enum Openness = closed | open
enum Style = filled | plain
type Button {
  state style: Style
}
type Card {
  state open: Openness
  has button: Button only when open = open
}

record Evidence {
  source: PenNode
}
actor Designer records Evidence
`,
      "Card.button",
      "open=open",
    );
    expect(run("review", "spec/button.dxn").code).toBe(0);
    expect(page("card.md")).toMatchInlineSnapshot(`
      "# Card

      Written by \`dxn review\` from the stored Evidence of \`spec/button.dxn\`; run it again rather than edit this page.

      Evidence for 1 of 4 combinations.

      ## Card

      | open | status | as recorded |
      | --- | --- | --- |
      | closed | **missing** | — |
      | open | **missing** | — |

      ## Card.button

      | open | style | status | as recorded |
      | --- | --- | --- | --- |
      | open | filled |  | ![Card.button with open = open: style = filled](pictures/filled.png) |
      | open | plain | **missing** | — |
      "
    `);
  });

  it("writes, for a type, only the page of the tree it is in, by its own name or inside one", () => {
    const { run } = project(
      `enum Openness = closed | open
enum Style = filled | plain
type Button {
  state style: Style
}
type Card {
  state open: Openness
  has button: Button only when open = open
}
type Banner {
}

record Evidence {
  source: PenNode
}
actor Designer records Evidence
`,
      "Card.button",
      "open=open",
    );
    const written = (...args: string[]) =>
      (
        JSON.parse(run("review", "spec/button.dxn", ...args, "--json").stdout) as {
          written: string[];
        }
      ).written;
    expect([written(), written("Banner"), written("Button"), written("Card")]).toEqual([
      [
        "<cache>/review/<repository>/spec/evidence/card.md",
        "<cache>/review/<repository>/spec/evidence/banner.md",
      ],
      ["<cache>/review/<repository>/spec/evidence/banner.md"],
      ["<cache>/review/<repository>/spec/evidence/card.md"],
      ["<cache>/review/<repository>/spec/evidence/card.md"],
    ]);
  });

  it("writes, with --stale, a page of only what is stale or gone, which needs a decision", () => {
    const { root, run, page } = project();
    writeFileSync(join(root, "design", "button.pen"), pen("#000000"));
    const result = run("review", "spec/button.dxn", "--stale");
    expect(result.stdout).toBe("Wrote <cache>/review/<repository>/spec/evidence/button.stale.md\n");
    expect(page("button.stale.md")).toMatchInlineSnapshot(`
      "# Button: stale, gone and outdated

      Written by \`dxn review\` from the stored Evidence of \`spec/button.dxn\`; run it again rather than edit this page.

      Evidence for 0 of 2 combinations; 1 stale.

      | style | status | as recorded |
      | --- | --- | --- |
      | filled | **stale** | ![Button: style = filled](pictures/filled.png) |
      "
    `);
  });

  it("writes, with --stale, no page where nothing is stale or gone, and says so", () => {
    const { root, run, folder } = project();
    // A stale page from before, when something was.
    writeFileSync(join(root, "design", "button.pen"), pen("#000000"));
    run("review", "spec/button.dxn", "--stale");
    writeFileSync(join(root, "design", "button.pen"), pen("#B3261E"));
    const result = run("review", "spec/button.dxn", "--stale");
    const json = run("review", "spec/button.dxn", "--stale", "--json");
    expect([
      result.stdout,
      existsSync(join(folder, "button.stale.md")),
      JSON.parse(json.stdout),
    ]).toEqual([
      "Button: nothing is stale, gone or outdated\n",
      false,
      { file: "spec/button.dxn", written: [], clean: ["Button"], problems: [] },
    ]);
  });

  it("refuses a type the file does not declare", () => {
    const { run } = project();
    const result = run("review", "spec/button.dxn", "Buton");
    expect([result.code, result.stderr]).toEqual([
      1,
      "dxn: Buton is not a type; did you mean Button?\n",
    ]);
  });

  it("shows records made before the type gained a state as outdated, each with its picture and what it needs", () => {
    const { root, run, page } = project();
    // Hover, added since the filled button was recorded.
    writeFileSync(
      join(root, "spec", "button.dxn"),
      schema
        .replace(
          "enum Style = filled | plain\n",
          "enum Style = filled | plain\nenum Hover = rest | hovered\n",
        )
        .replace("state style: Style", "state style: Style, hover: Hover"),
    );
    const validated = run("validate", "spec/button.dxn");
    const status = run("status", "spec/button.dxn", "--missing");
    expect([validated.code, validated.stderr, status.code, status.stdout.split("\n")[0]]).toEqual([
      0,
      "spec/evidence/button.json:7:17: warning: outdated: $[0].context.states: recorded before Button had hover\n",
      0,
      "spec/button.dxn: Evidence for 0 of 4 combinations; 1 outdated",
    ]);
    expect(status.stdout).toContain(
      "\nOutdated:\n  Button: style = filled, recorded before hover\n",
    );
    expect(run("review", "spec/button.dxn").code).toBe(0);
    expect(run("review", "spec/button.dxn", "--stale").code).toBe(0);
    expect([page(), page("button.stale.md")]).toMatchInlineSnapshot(`
      [
        "# Button

      Written by \`dxn review\` from the stored Evidence of \`spec/button.dxn\`; run it again rather than edit this page.

      Evidence for 0 of 4 combinations; 1 outdated.

      | style | hover | status | as recorded |
      | --- | --- | --- | --- |
      | filled | rest | **missing** | — |
      | filled | hovered | **missing** | — |
      | plain | rest | **missing** | — |
      | plain | hovered | **missing** | — |

      **Outdated**: recorded before Button had hover; give each its value to count it again.

      | style | needs | as recorded |
      | --- | --- | --- |
      | filled | hover | ![Button: style = filled](pictures/filled.png) |
      ",
        "# Button: stale, gone and outdated

      Written by \`dxn review\` from the stored Evidence of \`spec/button.dxn\`; run it again rather than edit this page.

      Evidence for 0 of 4 combinations; 1 outdated.

      **Outdated**: recorded before Button had hover; give each its value to count it again.

      | style | needs | as recorded |
      | --- | --- | --- |
      | filled | hover | ![Button: style = filled](pictures/filled.png) |
      ",
      ]
    `);
  });

  it("prints, with --json, the pages it wrote", () => {
    const { run } = project();
    const result = run("review", "spec/button.dxn", "--json");
    expect([result.code, JSON.parse(result.stdout), result.stderr]).toEqual([
      0,
      {
        file: "spec/button.dxn",
        written: ["<cache>/review/<repository>/spec/evidence/button.md"],
        problems: [],
      },
      "",
    ]);
  });

  it("needs one file, and refuses while its stored records have problems", () => {
    const { root, run } = project();
    const usage = run("review", "spec/button.dxn", "Button", "Card");
    writeFileSync(join(root, "spec", "evidence", "button.json"), '[{ "actor": "Designer" }]\n');
    const broken = run("review", "spec/button.dxn");
    expect([usage.code, usage.stderr.split("\n")[0], broken.code]).toEqual([
      2,
      "dxn: give one file, whose evidence to review, and a type to review only its tree",
      1,
    ]);
  });
});
