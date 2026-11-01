import type { Condition, Located, ParseResult, Type } from "./ast.js";
import { conditionText, coverage, holds } from "./condition.js";
import { enumOf, valuesOf } from "./names.js";
import { alone } from "./status.js";

// Checks each condition of a type against the combinations it really has:
// what its rules, fixed and derived states and profiles leave, not every
// value of what it compares. One that is never true there is an error, one
// that is always true there a warning, where judging by values alone said
// neither. The file must have no other problems.
export function conditionsInMatrix(file: ParseResult): void {
  const valuesIn = (type: Type) => (subject: string) => valuesOf(file, enumOf(type, subject) ?? "");
  for (const type of file.types) {
    // Every combination of the type: a value for each of its states, and for
    // each dimension it needs, with every rule applied.
    const combinations = alone(file, type.name).map(({ dimensions, states: own }) => ({
      ...dimensions,
      ...own,
    }));
    const judge = (condition: Condition, at: Located, then: { never: string; always: string }) => {
      const holding = combinations.filter((combination) =>
        holds(condition, (name) => combination[name]),
      ).length;
      const real = holding === 0 ? "never" : holding === combinations.length ? "always" : undefined;
      // What judging by values alone said is reported already.
      if (real === undefined || coverage(condition, valuesIn(type)) === real) return;
      file.diagnostics.push({
        severity: real === "never" ? "error" : "warning",
        code: real === "never" ? "impossible-condition" : "vacuous-condition",
        message: `${conditionText(condition)} is ${real === "never" ? "never" : "always"} true, so ${then[real]}`,
        line: at.line,
        column: at.column,
      });
    };
    for (const rule of type.rules) {
      judge(rule.when, rule.state, {
        never: `${rule.value.name} exists nowhere`,
        always: "the rule restricts nothing",
      });
    }
    for (const child of type.children) {
      if (child.when === undefined) continue;
      judge(child.when, child, {
        never: `${child.name} is never there`,
        always: `${child.name} is always there`,
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
}
