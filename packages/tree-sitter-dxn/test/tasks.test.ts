import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The tasks Zed's run buttons offer, from the extension's tasks.json.

interface Task {
  label: string;
  command: string;
  args?: string[];
  cwd: string;
  tags: string[];
}

const tasks = JSON.parse(
  readFileSync(join(__dirname, "../../zed/languages/dxn/tasks.json"), "utf8"),
) as Task[];

// What a run button offers, by the tag of where it is: each task's label.
const offered = (tag: string) =>
  tasks.filter(({ tags }) => tags.includes(tag)).map(({ label }) => label);

// Runs a task as Zed does, the command and its arguments in single quotes for
// the user's shell, with Zed's values for a file and a type, a dxn that says
// it wrote two pages and that another tree has nothing stale, and a zed that
// notes what it opens: what dxn was given, what zed opened, and what the
// terminal shows.
function runAsZed(task: Task): [number | null, string, string[], string] {
  const folder = mkdtempSync(join(tmpdir(), "dxn-task-"));
  try {
    const opened = join(folder, "opened");
    const given = join(folder, "given");
    const stub = (name: string, body: string) => {
      writeFileSync(join(folder, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(folder, name), 0o755);
    };
    stub(
      "dxn",
      `echo "$@" > "${given}"\necho "Wrote /cache/review/button.md"\necho "Wrote /cache/review/a card.md"\necho "Banner: nothing is stale or gone"`,
    );
    stub("zed", `echo "$1" >> "${opened}"`);
    const value = (text: string) =>
      text
        .replaceAll("$ZED_RELATIVE_FILE", "spec/button.dxn")
        .replaceAll("$ZED_CUSTOM_parent", "Menu")
        .replaceAll("$ZED_CUSTOM_type", "Toggle")
        .replaceAll("$ZED_WORKTREE_ROOT", folder);
    const line = [task.command, ...(task.args ?? [])].map(value).join(" ");
    const run = spawnSync("/bin/sh", ["-c", `sh -c '${line}'`], {
      cwd: value(task.cwd),
      env: { ...process.env, PATH: `${folder}:${process.env.PATH}` },
      encoding: "utf8",
    });
    const read = (path: string) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return "";
      }
    };
    return [run.status, read(given), read(opened).split("\n").filter(Boolean), run.stdout];
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe("the run buttons' tasks", () => {
  it("offer, beside each type, its state matrix, its recorded evidence, and its stale evidence", () => {
    expect([offered("dxn-type"), offered("dxn-nested-type")]).toEqual([
      [
        "State matrix: $ZED_CUSTOM_type",
        "Recorded evidence: $ZED_CUSTOM_type",
        "Stale evidence: $ZED_CUSTOM_type",
      ],
      [
        "State matrix: $ZED_CUSTOM_parent.$ZED_CUSTOM_type",
        "Recorded evidence: $ZED_CUSTOM_parent.$ZED_CUSTOM_type",
        "Stale evidence: $ZED_CUSTOM_parent.$ZED_CUSTOM_type",
      ],
    ]);
  });

  it("review the type's tree, open each page dxn wrote, and show what else it says", () => {
    const task = (label: string) => tasks.find((each) => each.label === label) as Task;
    const pages = ["/cache/review/button.md", "/cache/review/a card.md"];
    const shown = "Banner: nothing is stale or gone\n";
    expect([
      runAsZed(task("Recorded evidence: $ZED_CUSTOM_type")),
      runAsZed(task("Stale evidence: $ZED_CUSTOM_type")),
      runAsZed(task("Recorded evidence: $ZED_CUSTOM_parent.$ZED_CUSTOM_type")),
      runAsZed(task("Stale evidence: $ZED_CUSTOM_parent.$ZED_CUSTOM_type")),
    ]).toEqual([
      [0, "review spec/button.dxn Toggle\n", pages, shown],
      [0, "review spec/button.dxn Toggle --stale\n", pages, shown],
      [0, "review spec/button.dxn Menu.Toggle\n", pages, shown],
      [0, "review spec/button.dxn Menu.Toggle --stale\n", pages, shown],
    ]);
  });
});
