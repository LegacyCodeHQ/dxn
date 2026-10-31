import type { Condition, Located } from "./ast.js";

// Each comparison in a condition, in the order written.
export function comparisons(condition: Condition): Extract<Condition, { kind: "compare" }>[] {
  return condition.kind === "compare" ? [condition] : condition.terms.flatMap(comparisons);
}

// What a condition compares: each state or dimension, once, in the order
// first compared.
export function subjects(condition: Condition): Located[] {
  const seen = new Map<string, Located>();
  for (const { subject } of comparisons(condition)) {
    if (!seen.has(subject.name)) seen.set(subject.name, subject);
  }
  return [...seen.values()];
}

// Whether a condition holds where each subject has the value given.
export function holds(
  condition: Condition,
  valueAt: (subject: string) => string | undefined,
): boolean {
  if (condition.kind === "compare") {
    const value = valueAt(condition.subject.name);
    return condition.values.some(({ name }) => name === value);
  }
  return condition.kind === "and"
    ? condition.terms.every((term) => holds(term, valueAt))
    : condition.terms.some((term) => holds(term, valueAt));
}

// A condition as it is written, with an "and" or "or" inside another in
// brackets: "Pointer = mouse and (Breakpoint = lg or Breakpoint = xl)".
export function conditionText(condition: Condition, inner = false): string {
  if (condition.kind === "compare") {
    const values = condition.values.map(({ name }) => name);
    const compared = values.length === 1 ? `= ${values[0]}` : `in (${values.join(", ")})`;
    return `${condition.subject.name} ${compared}`;
  }
  const joined = condition.terms
    .map((term) => conditionText(term, true))
    .join(` ${condition.kind} `);
  return inner ? `(${joined})` : joined;
}

// How often a condition holds over every combination of its subjects'
// values: never, always, or sometimes.
export function coverage(
  condition: Condition,
  valuesOf: (subject: string) => string[],
): "never" | "always" | "sometimes" {
  let combinations: Record<string, string>[] = [{}];
  for (const { name } of subjects(condition)) {
    combinations = combinations.flatMap((combination) =>
      valuesOf(name).map((value) => ({ ...combination, [name]: value })),
    );
  }
  const holding = combinations.filter((combination) =>
    holds(condition, (subject) => combination[subject]),
  ).length;
  return holding === 0 ? "never" : holding === combinations.length ? "always" : "sometimes";
}
