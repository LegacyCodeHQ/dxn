import type { Documentation, ResolvedResult } from "@language/core/ast.js";
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
    const groups = new Map<Documentation, string[]>();
    for (const state of type.states) {
      if (!state.documentation) continue;
      const names = groups.get(state.documentation) ?? [];
      names.push(state.name);
      groups.set(state.documentation, names);
    }
    for (const [documentation, names] of groups) checkBlock(documentation, "state", names, report);
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
