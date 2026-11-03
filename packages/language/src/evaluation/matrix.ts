import type { Condition, Diagnostic, Located, ResolvedResult, Type } from "@language/core/ast.js";
import { message, words } from "@language/core/message.js";
import { reportTo } from "@language/evaluation/check-values.js";
import { alone } from "@language/evaluation/status.js";
import { conditionText, coverage, holds } from "@language/model/condition.js";
import { enumOf, valuesOf } from "@language/model/names.js";

// Checks each condition of a type against the combinations it really has:
// what its rules, fixed and derived states and profiles leave, not every
// value of what it compares. One that is never true there is an error, one
// that is always true there a warning, where judging by values alone said
// neither. The file must have no other problems.
export function conditionsInMatrix(file: ResolvedResult): void {
  const valuesIn = (type: Type) => (subject: string) => valuesOf(file, enumOf(type, subject) ?? "");
  // Every type is judged before any finding is recorded: a recorded error is
  // a problem, and a file with problems cannot be evaluated.
  const found: Diagnostic[] = [];
  const report = reportTo(found);
  for (const type of file.types) {
    // Enumerate only when a condition needs judging, once for this type.
    // A type without conditions can have many states without needing their
    // Cartesian product just to read or check it.
    let combinations: Record<string, string>[] | undefined;
    const judge = (condition: Condition, at: Located, then: { never: string; always: string }) => {
      combinations ??= alone(file, type.name).map(({ dimensions, states: own }) => ({
        ...dimensions,
        ...own,
      }));
      const holding = combinations.filter((combination) =>
        holds(condition, (name) => combination[name]),
      ).length;
      const real = holding === 0 ? "never" : holding === combinations.length ? "always" : undefined;
      // What judging by values alone said is reported already.
      if (real === undefined || coverage(condition, valuesIn(type)) === real) return;
      const said = message`${conditionText(condition)} is ${words(real)} true, so ${words(then[real])}`;
      if (real === "never") report.error("impossible-condition", said, at);
      else report.warn("vacuous-condition", said, at);
    };
    for (const rule of type.rules) {
      judge(rule.when, rule.state, {
        never: message`${rule.value.name} exists nowhere`,
        always: "the rule restricts nothing",
      });
    }
    for (const child of type.children) {
      if (child.when === undefined) continue;
      judge(child.when, child, {
        never: message`${child.name} is never there`,
        always: message`${child.name} is always there`,
      });
    }
    for (const trigger of type.triggers) {
      if (trigger.when === undefined) continue;
      judge(trigger.when, trigger, {
        never: "the trigger never fires",
        always: "the trigger always fires",
      });
    }
    for (const alike of type.alikes) {
      if (alike.when === undefined) continue;
      judge(alike.when, alike.subject, {
        never: "nothing is alike",
        always: "the when restricts nothing",
      });
    }
  }
  file.diagnostics.push(...found);
}
