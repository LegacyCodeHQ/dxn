import type { Documentation, ResolvedResult, State } from "@language/core/ast.js";
import { message } from "@language/core/message.js";
import type { Report } from "@language/evaluation/check-values.js";

// Syntax retains every tag. Analysis validates its direct declaration and
// keeps the first valid description when that target is documented again.
export function checkDocumentation(file: ResolvedResult, report: Report): void {
  for (const declared of file.enums) {
    if (!declared.broken) {
      checkBlock(
        declared.documentation,
        "enum",
        declared.values.map(({ name }) => name),
        report,
      );
    }
  }
  for (const type of file.types) {
    if (type.broken) continue;
    checkBlock(type.documentation, "type", [], report);
    // One comma-separated state declaration shares one documentation block.
    // Validate that block once against precisely the states it declares.
    const groups = new Map<Documentation, State[]>();
    for (const state of type.states) {
      if (!state.documentation) continue;
      const states = groups.get(state.documentation) ?? [];
      states.push(state);
      groups.set(state.documentation, states);
    }
    for (const [documentation, states] of groups) {
      const names = states.map(({ name }) => name);
      checkBlock(documentation, "state", names, report);
      const documented = new Set(
        documentation.tags
          .filter(({ name, target }) => name === "state" && target && names.includes(target.name))
          .map(({ target }) => target?.name),
      );
      // Tags opt a declaration into per-state documentation. Prose-only groups
      // and wholly undocumented declarations keep documentation optional.
      if (states.length < 2 || documented.size === 0) continue;
      for (const state of states) {
        if (documented.has(state.name)) continue;
        report.warn(
          "missing-state-documentation",
          message`state ${state.name} has no documentation; this declaration documents other states`,
          state,
        );
      }
    }
  }
}

function checkBlock(
  documentation: Documentation | undefined,
  kind: "enum" | "type" | "state",
  targets: readonly string[],
  { error, warn }: Report,
): void {
  if (!documentation) return;
  const seen = new Map<string, number>();
  documentation.tags = documentation.tags.filter((tag) => {
    const name = `@${tag.name}`;
    if (tag.name !== "value" && tag.name !== "state") {
      error(
        "unknown-documentation-tag",
        message`unknown documentation tag ${name}; use ${["@value", "@state"]}`,
        tag,
      );
      return true;
    }
    if ((tag.name === "value" && kind !== "enum") || (tag.name === "state" && kind !== "state")) {
      error(
        "documentation-tag-kind",
        tag.name === "value"
          ? message`${name} is only valid directly on an enum`
          : message`${name} is only valid directly on a state declaration`,
        tag,
      );
      return true;
    }
    const target = tag.target;
    if (!target) {
      error("missing-documentation-target", message`${name} requires a target name`, tag);
      return true;
    }
    if (!targets.includes(target.name)) {
      error(
        "unknown-documentation-target",
        kind === "enum"
          ? message`${target.name} is not a value declared by this enum (${targets})`
          : message`${target.name} is not a state in this declaration (${targets})`,
        target,
      );
      return true;
    }
    const earlier = seen.get(target.name);
    if (earlier !== undefined) {
      warn(
        "duplicate-documentation-tag",
        message`${name} already documents ${target.name} at line ${earlier}; the first description is kept`,
        tag,
      );
      return false;
    }
    seen.set(target.name, tag.line);
    return true;
  });
}
