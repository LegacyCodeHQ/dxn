import type { ParseResult } from "./ast.js";
import { profilesOf } from "./profiles.js";
import { penNode } from "./scalars.js";
import { type Check, describe, type Judged, judge } from "./status.js";

// A page to review a tree's evidence by: the tree's root, and the page as
// Markdown.
export interface ReviewPage {
  root: string;
  markdown: string;
}

// For each tree, a page of its combinations, each with its status as dxn
// status judges it and the picture of what was recorded: an element's own
// table, under its path when the tree has more than one. A row's picture is
// what picture gives for its entry's node, or its frame without one: a path
// relative to the page, or nothing when there is none. The file and the data
// must have no problems.
export function reviewPages(
  file: ParseResult,
  record: string,
  sources: string[],
  check: Check | undefined,
  picture: (id: string) => string | undefined,
  from: string,
): ReviewPage[] {
  const field = file.records
    .find(({ name }) => name === record)
    ?.fields.find(({ type }) => type.name === penNode.name)?.name;
  const every = profilesOf(file).map(({ name }) => name);
  const trees = new Map<string, ReturnType<typeof judge>>();
  for (const element of judge(file, record, sources, check)) {
    const root = element.path.split(".")[0] as string;
    trees.set(root, [...(trees.get(root) ?? []), element]);
  }
  return [...trees].map(([root, elements]) => {
    const all = elements.flatMap(({ combinations }) => combinations);
    const count = (state: Judged["state"]) => all.filter((each) => each.state === state).length;
    const summary = [
      `${record} for ${count("present")} of ${all.length} combinations`,
      ...(count("stale") > 0 ? [`${count("stale")} stale`] : []),
      ...(count("gone") > 0 ? [`${count("gone")} gone`] : []),
    ].join("; ");
    const sections = elements.map(({ path, combinations }) => {
      const table = tableOf(file, path, combinations, every, (entry) => {
        const at = field === undefined ? undefined : (entry[field] as Record<string, unknown>);
        const id = (at?.node ?? at?.frame) as string | undefined;
        return id === undefined ? undefined : picture(id);
      });
      return elements.length === 1 ? table : `## ${path}\n\n${table}`;
    });
    return {
      root,
      markdown: [
        `# ${root}`,
        "",
        `Written by \`dxn review\` from the stored ${record} of \`${from}\`; run it again rather than edit this page.`,
        "",
        `${summary}.`,
        "",
        ...sections.flatMap((section) => [section, ""]),
      ].join("\n"),
    };
  });
}

// An element's combinations as a table: a column for the profiles when the
// file has some, for each dimension, each parent's state that places it and
// each of its own states, then its status and its picture.
function tableOf(
  file: ParseResult,
  path: string,
  combinations: Judged[],
  every: string[],
  picture: (entry: Record<string, unknown>) => string | undefined,
): string {
  const keys = (of: (judged: Judged) => Record<string, string>) => [
    ...new Set(combinations.flatMap((judged) => Object.keys(of(judged)))),
  ];
  const dimensions = keys(({ combination }) => combination.dimensions);
  const parents = keys(({ combination }) => combination.parents);
  const states = keys(({ combination }) => combination.states);
  const header = [
    ...(every.length > 0 ? ["profile"] : []),
    ...dimensions,
    ...parents,
    ...states,
    "status",
    "as recorded",
  ];
  const rows = combinations.map((judged) => {
    const { combination, state, entry } = judged;
    const covered = combination.profiles ?? every;
    const profiles = every.every((name) => covered.includes(name)) ? "every" : covered.join(", ");
    const found = entry === undefined ? undefined : picture(entry);
    const shown =
      entry === undefined
        ? "—"
        : found === undefined
          ? "no picture"
          : `![${describe(file, path, combination)}](${found})`;
    return [
      ...(every.length > 0 ? [profiles] : []),
      ...dimensions.map((name) => combination.dimensions[name] ?? ""),
      ...parents.map((name) => combination.parents[name] ?? ""),
      ...states.map((name) => combination.states[name] ?? ""),
      state === "present" ? state : `**${state}**`,
      shown,
    ];
  });
  return [header, header.map(() => "---"), ...rows]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}
