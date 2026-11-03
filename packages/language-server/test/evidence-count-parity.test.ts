import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run } from "@cli/cli.js";
import { type Hint, hintsBeside } from "@language-server/protocol/evidence.js";
import { evidenceLabel, Fingerprints, parse, type Usage } from "@legacycodehq/dxn-language";
import { afterAll, describe, expect, it } from "vitest";

// These projections are fixture expectations, deliberately independent of
// progress/treePlaces: which CLI paths belong at each written declaration.
interface Place {
  at: string;
  paths: string[];
  usage?: Omit<Usage, "own"> & { own: string };
}
interface StatusPath {
  path: string;
  recorded: number;
  combinations: number;
  stale: number;
  gone: number;
  outdated: number;
  listed: { outdated: { says: string; added: string[] }[] };
}
interface Status {
  records: { record: string; paths: StatusPath[] }[];
  problems: { severity: string }[];
  error?: string;
}
type CountHint = Pick<Hint, "line" | "column" | "usage" | "label">;
const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});
function project(source: string, stored: Record<string, unknown[]> = {}) {
  const root = mkdtempSync(join(tmpdir(), "dxn-count-parity-"));
  folders.push(root);
  const file = join(root, "spec.dxn");
  writeFileSync(file, source);
  for (const [path, entries] of Object.entries(stored)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(entries));
  }
  return { root, file };
}
function status(root: string, file: string): Status {
  let stdout = "";
  const code = run(["status", relative(root, file), "--json"], {
    cwd: root,
    stdout: (text) => {
      stdout += text;
    },
    stderr: () => {},
  });
  const found: Status = JSON.parse(stdout);
  if (code !== 0 || found.error || !found.records) throw new Error(stdout);
  return found;
}
function expectedHints(source: string, found: Status, places: Place[]): CountHint[] {
  return places
    .map(({ at, paths, usage }) => {
      const lines = source.split(/\r\n|\n|\r/);
      const matches = lines.flatMap((text, index) =>
        text.trimStart().startsWith(at) ? [{ text, index }] : [],
      );
      if (matches.length !== 1) throw new Error(`ambiguous or missing fixture anchor: ${at}`);
      const match = matches[0];
      if (!match) throw new Error(`missing fixture anchor: ${at}`);
      const { text, index } = match;
      const labels = found.records.map(({ record, paths: counted }) => {
        const lookup = (path: string) => {
          const item = counted.find((item) => item.path === path);
          if (!item) throw new Error(`missing CLI path: ${record} ${path}`);
          return item;
        };
        const selected = paths.map(lookup);
        const sum = (key: "recorded" | "combinations" | "stale" | "gone") =>
          selected.reduce((sum, each) => sum + each[key], 0);
        const count = {
          record,
          recorded: sum("recorded"),
          combinations: sum("combinations"),
          stale: sum("stale"),
          gone: sum("gone"),
          outdated: selected.flatMap((each) =>
            each.listed.outdated.map((old) => ({ ...old, path: each.path })),
          ),
        };
        const wording = usage ? { ...usage, own: lookup(usage.own).combinations } : undefined;
        const mark =
          count.stale || count.gone || count.outdated.length
            ? "◌"
            : count.recorded === count.combinations
              ? "●"
              : count.recorded
                ? "◐"
                : "○";
        return `${mark} ${evidenceLabel(count, wording)}`;
      });
      return {
        line: index + 1,
        column: text.indexOf(at) + (at.match(/^(?:type|has) /)?.[0].length ?? 0) + 1,
        usage: usage !== undefined,
        label: labels.join(" · "),
      };
    })
    .sort((a, b) => a.line - b.line || a.column - b.column);
}
function actualHints(file: string): CountHint[] {
  const found = hintsBeside(pathToFileURL(file).href, parse(readFileSync(file, "utf8")));
  if (found === undefined) throw new Error("expected countable evidence");
  return found.map(({ line, column, usage, label }) => ({ line, column, usage, label }));
}
const place = (at: string, ...paths: string[]): Place => ({ at, paths });
const usage = (
  at: string,
  path: string,
  parent: string,
  component: string,
  ...pins: string[]
): Place => ({
  at,
  paths: [path],
  usage: { in: parent, of: component, own: component, pins },
});
const repository = join(fileURLToPath(import.meta.url), "../../../..");
const examples: { title: string; path: string; places: Place[] }[] = [
  {
    title: "settings",
    path: "examples/settings/settings.dxn",
    places: [
      place("type Help", "Help"),
      place("has toggle", "Help.toggle"),
      place("has text", "Help.text"),
      place("type Window", "Window"),
      place("has tabs", "Window.tabs"),
      place("has general", "Window.tabs.general"),
      place("has privacy", "Window.tabs.privacy"),
      usage("has help", "Window.help", "Window", "Help"),
    ],
  },
  {
    title: "gazette",
    path: "examples/gazette/gazette.dxn",
    places: [
      ...[
        "Button",
        "Toggle",
        "Tab",
        "TabBar",
        "BackButton",
        "NavigationBar",
        "ArticleRow",
        "SourceRow",
        "FeedScreen",
      ].map((name) => place(`type ${name} {`, name)),
      ...["feed", "saved", "sources"].map((name) =>
        usage(`has ${name}`, `TabBar.${name}`, "TabBar", "Tab"),
      ),
      usage("has back", "NavigationBar.back", "NavigationBar", "BackButton"),
      usage("has toggle", "SourceRow.toggle", "SourceRow", "Toggle"),
      usage(
        "has navigation",
        "FeedScreen.navigation",
        "FeedScreen",
        "NavigationBar",
        "kind = root",
      ),
      usage("has tabs", "FeedScreen.tabs", "FeedScreen", "TabBar", "section = feed"),
      usage(
        "unread:",
        "FeedScreen.articles.unread",
        "FeedScreen",
        "ArticleRow",
        "reading = unread",
      ),
      usage("read:", "FeedScreen.articles.read", "FeedScreen", "ArticleRow", "reading = read"),
      usage("has follow", "FeedScreen.follow", "FeedScreen", "Button", "style = primary"),
    ],
  },
];
const model = `enum Mode = off | on
type Alpha { state mode: Mode }
type Beta { state mode: Mode }
record Evidence { note: NonEmptyString }
record Audit { note: NonEmptyString }
actor Designer records Evidence
actor Reviewer records Audit
`;
const entry = (type: string, mode: string, actor = "Designer") => ({
  context: { type, dimensions: {}, states: { mode } },
  actor,
  note: "Seen.",
});
const simple = () =>
  project(model, {
    "evidence/a.json": [entry("Alpha", "off")],
    "audit/a.json": [entry("Beta", "off", "Reviewer"), entry("Beta", "on", "Reviewer")],
  });
const simplePlaces = [place("type Alpha", "Alpha"), place("type Beta", "Beta")];

describe("evidence counts by declaration and record", () => {
  it.each(examples)(
    "matches every hint, including component usages: $title",
    ({ path, places }) => {
      const file = join(repository, path);
      expect(actualHints(file)).toEqual(
        expectedHints(readFileSync(file, "utf8"), status(repository, file), places),
      );
    },
  );

  it.each([false, true])(
    "includes every element and record, with stored records absent: %s",
    (empty) => {
      const { root, file } = empty ? project(model) : simple();
      expect(actualHints(file)).toEqual(expectedHints(model, status(root, file), simplePlaces));
    },
  );

  it.each(["recorded", "stale", "gone", "outdated"])(
    "compares every freshness count: %s",
    (state) => {
      const source =
        "enum Mode = off | on\ntype Alpha { state mode: Mode }\nrecord Evidence { source: PenNode }\nactor Designer records Evidence\n";
      const { root, file } = project(source);
      const drawing = join(root, "design.txt");
      writeFileSync(drawing, "drawn");
      const fingerprint = new Fingerprints().of(drawing, "frame");
      mkdirSync(join(root, "evidence"));
      writeFileSync(
        join(root, "evidence/a.json"),
        JSON.stringify([
          {
            context: {
              type: "Alpha",
              dimensions: {},
              states: state === "outdated" ? {} : { mode: "off" },
            },
            actor: "Designer",
            source: { file: "design.txt", frame: "frame", fingerprint },
          },
        ]),
      );
      if (state === "stale") writeFileSync(drawing, "redrawn");
      if (state === "gone") rmSync(drawing);
      expect(actualHints(file)).toEqual(
        expectedHints(source, status(root, file), [place("type Alpha", "Alpha")]),
      );
    },
  );

  it("combines paths at a declaration that has no standalone tree", () => {
    const source = `enum Mode = off | on
type Part receives mode: Mode {
  state choice: Mode
  choice = on only when mode = on
}
type Holder receives mode: Mode {
  has part: Part
}
type One {
  state mode: Mode = off
  provides mode
  has first: Holder
}
type Two {
  state mode: Mode = on
  provides mode
  has second: Holder
}
record Evidence { note: NonEmptyString }
actor Designer records Evidence
`;
    const { root, file } = project(source);
    expect(actualHints(file)).toEqual(
      expectedHints(source, status(root, file), [
        place("has part", "One.first.part", "Two.second.part"),
        place("type One", "One"),
        place("has first", "One.first"),
        place("type Two", "Two"),
        place("has second", "Two.second"),
      ]),
    );
  });
});
