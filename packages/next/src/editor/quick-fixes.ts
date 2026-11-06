import { analyze, type Problem, type RuleId } from "@next/analysis/analyze.js";
import type { Span } from "@next/model/enumeration.js";
import type { Edit } from "@next/refactor/rename.js";

export interface NamingFix {
  title: string;
  rule: RuleId;
  problem: Problem;
  at: Span;
  edits: readonly Edit[];
}

/** Recompute individual corrections from current source; never apply client-supplied suggestions. */
export function quickFixes(source: string, selection: Span): NamingFix[] {
  if (
    !Number.isInteger(selection.start) ||
    !Number.isInteger(selection.end) ||
    selection.start < 0 ||
    selection.end < selection.start ||
    selection.end > source.length
  )
    return [];
  const { problems } = analyze(source);
  // Parsing stops at the first syntax error, so later declarations may hide a collision.
  if (problems.some((p) => p.code === "syntax-error")) return [];
  return problems.flatMap((problem) => {
    const { suggestion, rule } = problem;
    if (!suggestion || !rule || !["badEnumName", "badValueName"].includes(problem.code)) return [];
    return problem.at
      .filter((at) =>
        selection.start === selection.end
          ? at.start <= selection.start && selection.start <= at.end
          : selection.start < at.end && at.start < selection.end,
      )
      .map((at) => ({
        title: `Replace '${source.slice(at.start, at.end)}' with '${suggestion}'`,
        rule,
        problem,
        at,
        edits: [{ span: at, text: suggestion }],
      }));
  });
}
