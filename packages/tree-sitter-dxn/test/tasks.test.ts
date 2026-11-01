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

describe("the run buttons' tasks", () => {
  it("offer, beside each type, to review the file's evidence and open each page written", () => {
    const review = tasks.find(({ label }) => label.startsWith("dxn review"));
    expect(review?.tags).toEqual(["dxn-type", "dxn-nested-type"]);
    // Run as Zed runs it, the command and its arguments in single quotes for
    // the user's shell, with a dxn that writes two pages, and a zed that notes
    // what it opens.
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
        `echo "$@" > "${given}"\necho "Wrote /cache/review/button.md"\necho "Wrote /cache/review/a card.md"`,
      );
      stub("zed", `echo "$1" >> "${opened}"`);
      const value = (text: string) =>
        text
          .replaceAll("$ZED_RELATIVE_FILE", "spec/button.dxn")
          .replaceAll("$ZED_WORKTREE_ROOT", folder);
      const line = [review?.command ?? "", ...(review?.args ?? [])].map(value).join(" ");
      const run = spawnSync("/bin/sh", ["-c", `sh -c '${line}'`], {
        cwd: value(review?.cwd ?? ""),
        env: { ...process.env, PATH: `${folder}:${process.env.PATH}` },
        encoding: "utf8",
      });
      expect([
        run.status,
        readFileSync(given, "utf8"),
        readFileSync(opened, "utf8").split("\n"),
      ]).toEqual([
        0,
        "review spec/button.dxn\n",
        ["/cache/review/button.md", "/cache/review/a card.md", ""],
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
