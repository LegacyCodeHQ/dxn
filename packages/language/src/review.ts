import type { ParseResult } from "./ast.js";
import { profilesOf } from "./profiles.js";
import { penNode } from "./scalars.js";
import { type Check, describe, type Judged, judge, type Outdated } from "./status.js";
import { evidenceLabel, evidenceVerb } from "./vocabulary.js";

// A page to review a tree's evidence by: the tree's root, and the page as
// Markdown.
export interface ReviewPage {
  root: string;
  markdown: string;
  // Whether it shows no combination: none is in the states asked for.
  empty: boolean;
}

// Which pages to write: those of the trees with these roots, every tree's
// without; and only the combinations in these states, which need a decision,
// every one without.
export interface ReviewOptions {
  roots?: string[];
  only?: Judged["state"][];
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
  { roots, only }: ReviewOptions = {},
): ReviewPage[] {
  const field = file.records
    .find(({ name }) => name === record)
    ?.fields.find(({ type }) => type.name === penNode.name)?.name;
  const every = profilesOf(file).map(({ name }) => name);
  const trees = new Map<string, ReturnType<typeof judge>>();
  for (const element of judge(file, record, sources, check)) {
    const root = element.path.split(".")[0] as string;
    if (roots !== undefined && !roots.includes(root)) continue;
    trees.set(root, [...(trees.get(root) ?? []), element]);
  }
  // A row's picture, by its entry's node, or its frame without one.
  const pictureOf = (entry: Record<string, unknown>) => {
    const at = field === undefined ? undefined : (entry[field] as Record<string, unknown>);
    const id = (at?.node ?? at?.frame) as string | undefined;
    return id === undefined ? undefined : picture(id);
  };
  return [...trees].map(([root, elements]) => {
    const all = elements.flatMap(({ combinations }) => combinations);
    const count = (state: Judged["state"]) => all.filter((each) => each.state === state).length;
    // The count, in the words dxn status and an editor's hint have it in.
    const summary = evidenceLabel(
      {
        record,
        present: count("present"),
        combinations: all.length,
        stale: count("stale"),
        gone: count("gone"),
        outdated: elements.flatMap(({ path, outdated: each }) =>
          each.map(({ says, added }) => ({ path, says, added })),
        ),
      },
      evidenceVerb(file, record),
    );
    // The elements with something to show: their combinations, only those
    // asked for, and their outdated records, which always need a decision.
    const sections = elements.flatMap(({ path, combinations, outdated: old }) => {
      const those = combinations.filter(({ state }) => only === undefined || only.includes(state));
      if (those.length === 0 && old.length === 0) return [];
      const parts = [
        ...(those.length > 0 ? [tableOf(file, path, those, every, pictureOf)] : []),
        ...(old.length > 0 ? [outdatedOf(path, old, pictureOf)] : []),
      ].join("\n\n");
      return [elements.length === 1 ? parts : `## ${path}\n\n${parts}`];
    });
    const asked = only === undefined ? [] : [...only, "outdated"];
    const listing = (words: string[], last: string) =>
      words.length > 1
        ? `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}`
        : (words[0] ?? "");
    const which = only === undefined ? "" : `: ${listing(asked, "and")}`;
    const none = only === undefined ? [] : [`Nothing is ${listing(asked, "or")}.`];
    return {
      root,
      empty: sections.length === 0,
      markdown: [
        `# ${root}${which}`,
        "",
        `Written by \`dxn review\` from the stored ${record} of \`${from}\`; run it again rather than edit this page.`,
        "",
        `${summary}.`,
        "",
        ...(sections.length === 0 ? [...none, ""] : sections.flatMap((section) => [section, ""])),
      ].join("\n"),
    };
  });
}

// An element's combinations as a table: a column for the profiles when the
// file has some, for each dimension, each parent's state that places it and
// each of its own states, then its status and its picture. The status says
// only what needs attention, blank where a combination is present, and is
// left out where every one is.
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
  const attention = combinations.some(({ state }) => state !== "present");
  const header = [
    ...(every.length > 0 ? ["profile"] : []),
    ...dimensions,
    ...parents,
    ...states,
    ...(attention ? ["status"] : []),
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
      ...(attention ? [state === "present" ? "" : `**${state}**`] : []),
      shown,
    ];
  });
  return [header, header.map(() => "---"), ...rows]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

// An element's outdated records as a table: why they are, what to do, then a
// column for each name they give, what each needs, and its picture.
function outdatedOf(
  path: string,
  old: Outdated[],
  picture: (entry: Record<string, unknown>) => string | undefined,
): string {
  const contexts = old.map(({ entry }) => {
    const context = entry.context as {
      dimensions?: Record<string, string>;
      states?: Record<string, string>;
    };
    return { ...context.dimensions, ...context.states };
  });
  const names = [...new Set(contexts.flatMap((each) => Object.keys(each)))];
  const added = [...new Set(old.flatMap(({ added: each }) => each))].join(" and ");
  const rows = old.map(({ added: needs, entry }, index) => {
    const found = picture(entry);
    const said = contexts[index] ?? {};
    const alt = `${path}: ${Object.entries(said)
      .map(([name, value]) => `${name} = ${value}`)
      .join(", ")}`;
    return [
      ...names.map((name) => said[name] ?? ""),
      needs.join(", "),
      found === undefined ? "no picture" : `![${alt}](${found})`,
    ];
  });
  const header = [...names, "needs", "as recorded"];
  return [
    `**Outdated**: recorded before ${path} had ${added}; give each its value to count it again.`,
    "",
    ...[header, header.map(() => "---"), ...rows].map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}
