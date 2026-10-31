import { sharedStates } from "./queries.js";
import type { Context, Resolver } from "./resolve.js";

// A cell: true when the value (or node) is there in every setup of the row,
// false in none, the setups' names when only some, or for a node that exists
// only in some states of a shared node, those states.
export type Cell = boolean | string[] | Record<string, string[]>;

// A setup the tables count: a profile, or a combination of dimension values
// when no profile covers the dimensions. Its values are what it fixes.
interface Setup {
  name: string;
  values: Record<string, string>;
}

// A row: a setup, or with --by dimensions, every setup with those values;
// with --by a shared node, also one of its states, which where fixes.
interface Row {
  label: string;
  setups: Setup[];
  where: Record<string, string>;
}

const inRow = (row: Row, contexts: Context[]) =>
  contexts.filter((context) =>
    Object.entries(row.where).every(([name, value]) => context[name] === value),
  );

export interface NodeTables {
  node: string;
  by: string[];
  tables: { group: string; rows: { row: string; values: Record<string, Cell> }[] }[];
  notPresent?: string[];
  onlyWhen?: Record<string, string[]>;
}

export interface PresenceMatrix {
  node: string;
  by: string[];
  columns: string[];
  rows: { node: string; cells: Cell[] }[];
}

// Whether a context belongs to a setup: it has the setup's value for every
// dimension it names.
const fits = (setup: Setup, context: Context) =>
  Object.entries(setup.values).every(
    ([name, value]) => context[name] === undefined || context[name] === value,
  );

function setups(resolver: Resolver, dimensions: string[]): Setup[] {
  const covered = dimensions.filter((name) => resolver.profiled.has(name));
  const free = dimensions.filter((name) => !resolver.profiled.has(name));
  let result: Setup[] =
    covered.length === 0
      ? [{ name: "", values: {} }]
      : Object.keys(resolver.project.profiles?.profiles ?? {}).map((name) => {
          const profile = resolver.profiles.get(name) ?? {};
          return {
            name,
            values: Object.fromEntries(
              covered.map((dimension) => [dimension, profile[dimension] as string]),
            ),
          };
        });
  for (const name of free) {
    const options = resolver.project.dimensions[name]?.values ?? [];
    result = result.flatMap((setup) =>
      options.map((value) => ({
        name: setup.name === "" ? `${name}=${value}` : `${setup.name}, ${name}=${value}`,
        values: { ...setup.values, [name]: value },
      })),
    );
  }
  return result;
}

// The row axis: profile when profiles cover the dimensions, otherwise every
// dimension; or what --by names. Refuses anything else.
export function tableAxis(
  resolver: Resolver,
  dimensions: string[],
  by: string[] | undefined,
  subject: string,
  shared: string[] = [],
): string[] {
  const profiled = dimensions.some((name) => resolver.profiled.has(name));
  const axis = by ?? (profiled ? ["profile"] : dimensions);
  for (const name of axis) {
    const known =
      name === "profile" ? profiled : dimensions.includes(name) || shared.includes(name);
    if (!known) {
      throw new TableError(
        `"${name}" is not profile, a dimension or a shared node of ${subject} (${[...dimensions, ...shared].join(", ")})`,
      );
    }
  }
  return axis;
}

export class TableError extends Error {}

function rows(resolver: Resolver, dimensions: string[], axis: string[]): Row[] {
  const all = setups(resolver, dimensions);
  const sharedAxis = axis.filter((name) => resolver.isShared(name) && !dimensions.includes(name));
  const setupAxis = axis.filter((name) => !sharedAxis.includes(name));
  let result: Row[];
  if (setupAxis.length === 0) {
    result = [{ label: "", setups: all, where: {} }];
  } else if (setupAxis.length === 1 && setupAxis[0] === "profile") {
    result = all.map((setup) => ({ label: setup.name, setups: [setup], where: {} }));
  } else {
    let labels: Record<string, string>[] = [{}];
    for (const name of setupAxis) {
      const options = resolver.project.dimensions[name]?.values ?? [];
      labels = labels.flatMap((label) => options.map((value) => ({ ...label, [name]: value })));
    }
    result = labels.map((label) => ({
      label: setupAxis.map((name) => label[name]).join(", "),
      setups: all.filter((setup) => setupAxis.every((name) => setup.values[name] === label[name])),
      where: {},
    }));
  }
  for (const name of sharedAxis) {
    result = result.flatMap((row) =>
      sharedStates(resolver, name).map((state) => ({
        label: row.label === "" ? state : `${row.label}, ${state}`,
        setups: row.setups,
        where: { ...row.where, [name]: state },
      })),
    );
  }
  return result;
}

function cell(present: Setup[], all: Setup[], restricted?: Record<string, string[]>): Cell {
  if (present.length === 0) return false;
  if (present.length < all.length) return present.map((setup) => setup.name);
  return restricted !== undefined && Object.keys(restricted).length > 0 ? restricted : true;
}

// The states of shared nodes above the node that it exists in, where that is
// fewer than all of them.
function restrictions(
  resolver: Resolver,
  id: string,
  contexts: Context[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const name of new Set(contexts.flatMap((context) => Object.keys(context)))) {
    if (name === id || !resolver.isShared(name)) continue;
    const all = sharedStates(resolver, name);
    const seen = all.filter((state) => contexts.some((context) => context[name] === state));
    if (seen.length < all.length) result[name] = seen;
  }
  return result;
}

// One table per state group of a node: a row per setup (or --by value), a
// column per value of the group.
export function nodeTables(
  resolver: Resolver,
  id: string,
  contexts: Context[],
  axis: string[],
): NodeTables {
  const dimensions = resolver.dimensions(id);
  const type = resolver.node(id)?.type;
  const groups: [string, string[]][] = resolver.isShared(id)
    ? [[id, sharedStates(resolver, id)]]
    : type === undefined
      ? []
      : Object.entries(resolver.groupsOf(type));
  const presentRows: { row: Row; present: Setup[] }[] = [];
  const notPresent: string[] = [];
  for (const row of rows(resolver, dimensions, axis)) {
    const here = inRow(row, contexts);
    const present = row.setups.filter((setup) => here.some((context) => fits(setup, context)));
    if (present.length === 0) notPresent.push(row.label);
    else presentRows.push({ row, present });
  }
  const tables = groups.map(([group, values]) => ({
    group,
    rows: presentRows.map(({ row, present }) => ({
      row: row.label,
      values: Object.fromEntries(
        values.map((value) => [
          value,
          cell(
            present.filter((setup) =>
              inRow(row, contexts).some(
                (context) => fits(setup, context) && context[group] === value,
              ),
            ),
            present,
          ),
        ]),
      ),
    })),
  }));
  const onlyWhen = restrictions(resolver, id, contexts);
  return {
    node: id,
    by: axis,
    tables,
    ...(notPresent.length === 0 ? {} : { notPresent }),
    ...(Object.keys(onlyWhen).length === 0 ? {} : { onlyWhen }),
  };
}

// Which nodes of a subtree exist in which setups: a row per node, a column
// per setup (or --by value).
export function presenceMatrix(
  resolver: Resolver,
  id: string,
  nodes: { id: string; contexts: Context[] }[],
  axis: string[],
): PresenceMatrix {
  const columns = rows(resolver, resolver.axes(id).dimensions, axis);
  return {
    node: id,
    by: axis,
    columns: columns.map((column) => column.label),
    rows: nodes.map((node) => ({
      node: node.id,
      cells: columns.map((column) => {
        const here = inRow(column, node.contexts);
        const present = column.setups.filter((setup) =>
          here.some((context) => fits(setup, context)),
        );
        const inColumn = here.filter((context) => present.some((setup) => fits(setup, context)));
        return cell(present, column.setups, restrictions(resolver, node.id, inColumn));
      }),
    })),
  };
}

const text = (value: Cell): string =>
  value === true
    ? "✓"
    : value === false
      ? "—"
      : Array.isArray(value)
        ? value.join(", ")
        : Object.entries(value)
            .map(([name, states]) => `${name}=${states.join("|")}`)
            .join(", ");

// A Markdown table with its columns padded to their widest cell.
function markdown(header: string[], body: string[][]): string[] {
  const widths = header.map((title, index) =>
    Math.max(title.length, ...body.map((line) => (line[index] as string).length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((value, index) => value.padEnd(widths[index] as number)).join(" | ")} |`;
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...body.map(line)];
}

export function drawNodeTables(tables: NodeTables): string {
  const lines: string[] = [];
  for (const table of tables.tables) {
    const values = Object.keys(table.rows[0]?.values ?? {});
    lines.push(`### ${tables.node} · ${table.group}`, "");
    lines.push(
      ...markdown(
        [tables.by.join(", "), ...values],
        table.rows.map((row) => [
          row.row,
          ...values.map((value) => text(row.values[value] as Cell)),
        ]),
      ),
      "",
    );
  }
  if (tables.notPresent !== undefined)
    lines.push(`Not present: ${tables.notPresent.join(", ")}`, "");
  if (tables.onlyWhen !== undefined) lines.push(`Only when ${text(tables.onlyWhen)}`, "");
  return lines.join("\n");
}

export function drawPresenceMatrix(matrix: PresenceMatrix): string {
  return [
    `### ${matrix.node}`,
    "",
    ...markdown(
      ["node", ...matrix.columns],
      matrix.rows.map((row) => [row.node, ...row.cells.map(text)]),
    ),
    "",
  ].join("\n");
}
