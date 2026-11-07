import { analyze, type Problem } from "@next/analysis/analyze.js";
import { acceptFile } from "@next/check/file.js";

/** A type as a table: its enumeration names are the columns, and values are the rows. */
export interface CombinationTable {
  type: string;
  varies: string[];
  count: number;
  combinations: Record<string, string>[];
}

function checked(source: string) {
  const result = analyze(source);
  return {
    problems: result.problems,
    file: result.problems.length ? undefined : acceptFile(result.declarations).file,
  };
}

/** Exact counts for valid files, with no product enumeration or lossy number conversion. */
export function combinationCounts(source: string) {
  return (checked(source).file?.products ?? []).map(({ type, span, count }) => ({
    type,
    span,
    count: count.toString(),
  }));
}

export type ListedCombinations =
  | { kind: "listed"; types: CombinationTable[] }
  | { kind: "invalid"; problems: Problem[]; message: string }
  | { kind: "unknownType"; type: string; available: string[]; message: string };

/** One listing operation for CLI and editor consumers; never list part of an invalid file. */
export function listCombinations(source: string, type?: string): ListedCombinations {
  const { problems, file } = checked(source);
  if (!file)
    return {
      kind: "invalid",
      problems,
      message: "cannot list combinations while the file has problems",
    };
  const available = file.types.map((t) => t.name.text);
  if (type !== undefined && !available.includes(type)) {
    return {
      kind: "unknownType",
      type,
      available,
      message: `type '${type}' is not declared; ${available.length ? `available types: ${available.join(", ")}` : "no types declared"}`,
    };
  }
  return {
    kind: "listed",
    types: file.products
      .filter((p) => type === undefined || p.type === type)
      .map((p) => {
        const combinations = [...p.rows()].map((row) =>
          Object.fromEntries(row.map((value) => [value.enum, value.name])),
        );
        return { type: p.type, varies: p.varies, count: combinations.length, combinations };
      }),
  };
}

/** Canonical text shared by the command line and editor table display. */
export function renderCombinationTables(types: readonly CombinationTable[]): string {
  if (!types.length) return "no types declared";
  return types
    .map((t) => {
      const heading = `${t.type}: ${t.count} ${t.count === 1 ? "combination" : "combinations"}`;
      if (!t.varies.length) return `${heading} (varies over nothing)`;
      const rows = t.combinations.map((row, i) => [
        String(i + 1),
        ...t.varies.map((name) => row[name] ?? ""),
      ]);
      const table = [["#", ...t.varies], ...rows];
      const widths =
        table[0]?.map((_, i) =>
          table.reduce((width, row) => Math.max(width, row[i]?.length ?? 0), 0),
        ) ?? [];
      return `${heading}\n\n${table.map((row) => `  ${row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0))).join("  ")}`).join("\n")}`;
    })
    .join("\n\n");
}
