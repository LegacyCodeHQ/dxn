import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "@cli/cli.js";
import { evidence, hintsBeside } from "@language-server/protocol/evidence.js";
import { Fingerprints, parse, repositoryOf } from "@legacycodehq/dxn-language";
import { afterEach, describe, expect, it } from "vitest";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function project(git: boolean, mismatch = false) {
  const root = mkdtempSync(join(tmpdir(), "dxn-drawing-root-"));
  folders.push(root);
  const file = join(root, "specs", "spec.dxn");
  const directory = dirname(file);
  mkdirSync(join(directory, "evidence"), { recursive: true });
  mkdirSync(join(root, "elsewhere"));
  // A worktree's .git file is a root marker too.
  if (git) writeFileSync(join(root, ".git"), "gitdir: unused-for-root-discovery\n");
  const assetRoot = git ? root : directory;
  const source =
    "type Row {}\ntype Screen {\n  has row: Row\n}\nrecord Evidence {\n  source: PenNode\n}\nactor Designer records Evidence\n";
  writeFileSync(file, source);
  const design = join(assetRoot, "design.pen");
  writeFileSync(
    design,
    JSON.stringify({
      children: [
        { id: "row", type: "frame", name: "Row", reusable: true, children: [] },
        {
          id: "screen",
          type: "frame",
          children: [
            { id: "a", type: "ref", ref: "row" },
            ...(mismatch ? [{ id: "b", type: "ref", ref: "row" }] : []),
          ],
        },
      ],
    }),
  );
  writeFileSync(
    join(directory, "evidence/a.json"),
    JSON.stringify([
      {
        context: { type: "Screen", dimensions: {}, states: {} },
        actor: "Designer",
        source: {
          file: "design.pen",
          frame: "screen",
          fingerprint: new Fingerprints().of(design, "screen"),
        },
      },
    ]),
  );
  return { root, file, source, assetRoot };
}

function command(cwd: string, ...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run([...args, "--json"], {
    cwd,
    cache: join(cwd, ".test-cache"),
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr, output: JSON.parse(stdout) };
}

const locations = [".", "specs", "elsewhere"];
const cases = [false, true].flatMap((git) => locations.map((cwd) => ({ git, cwd })));

describe("drawing roots shared by CLI and editor", () => {
  it.each(cases)("counts the same saved evidence: $git Git root, cwd $cwd", ({ git, cwd }) => {
    const { root, file, source, assetRoot } = project(git);
    const working = join(root, cwd);
    const result = command(working, "status", relative(working, file));
    const shown = hintsBeside(pathToFileURL(file).href, parse(source));
    expect({
      root: repositoryOf(file),
      code: result.code,
      count: result.output.records[0].paths.find(({ path }: { path: string }) => path === "Screen"),
      hint: shown?.find(({ line }) => line === 2)?.short,
    }).toEqual({
      root: assetRoot,
      code: 0,
      count: {
        path: "Screen",
        combinations: 1,
        recorded: 1,
        stale: 0,
        gone: 0,
        missing: 0,
        outdated: 0,
        listed: { stale: [], gone: [], missing: [], outdated: [] },
      },
      hint: "● Evidence 1/1 recorded",
    });
  });

  it.each(cases)(
    "attaches and reviews from the same root: $git Git root, cwd $cwd",
    ({ git, cwd }) => {
      const { root, file, assetRoot } = project(git);
      const working = join(root, cwd);
      const path = relative(working, file);
      const source = { file: "design.pen", frame: "screen" };
      const attached = command(
        working,
        "attach",
        path,
        "Screen",
        "--actor",
        "Designer",
        "--data",
        JSON.stringify({ source }),
      );
      const stored = JSON.parse(readFileSync(join(dirname(file), "evidence/a.json"), "utf8"));
      const review = command(working, "review", path, "Screen");
      const page = review.output.written?.find((path: string) => path.endsWith("screen.md"));
      expect({
        attached: attached.code,
        stored: stored[0].source,
        reviewed: review.code,
        recorded:
          page === undefined
            ? false
            : /Evidence 1\/2 combinations recorded\./.test(readFileSync(page, "utf8")),
      }).toEqual({
        attached: 0,
        stored: {
          ...source,
          fingerprint: new Fingerprints().of(join(assetRoot, "design.pen"), "screen"),
        },
        reviewed: 0,
        recorded: true,
      });
    },
  );

  it.each(cases)("validates drawings before a rename: $git Git root, cwd $cwd", ({ git, cwd }) => {
    const { root, file, source } = project(git, true);
    const working = join(root, cwd);
    const path = relative(working, file);
    const validation = command(working, "validate", path);
    const rename = command(working, "rename", path, "Screen", "Panel");
    const shown = evidence(pathToFileURL(file).href, parse(source), source);
    expect({
      validation: [
        validation.code,
        validation.output.problems.map(({ code }: { code: string }) => code),
      ],
      editor: shown
        ?.get(pathToFileURL(join(dirname(file), "evidence/a.json")).href)
        ?.map(({ code }) => code),
      rename: [rename.code, rename.output.problems.map(({ code }: { code: string }) => code)],
      source: readFileSync(file, "utf8"),
    }).toEqual({
      validation: [1, ["drawing-mismatch"]],
      editor: ["drawing-mismatch"],
      rename: [1, ["drawing-mismatch"]],
      source,
    });
  });
});
