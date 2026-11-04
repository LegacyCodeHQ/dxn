import type {
  Branch,
  Documentation,
  DocumentationTag,
  Enum,
  Located,
  State,
  Type,
} from "@language/core/ast.js";

// The synchronous portion of Tree-sitter's node API used by lowering. Indices
// are UTF-16 offsets, as in the JavaScript bindings. No runtime binding is
// selected here; this module only translates an already parsed tree.
export interface ConcreteNode {
  readonly type: string;
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly hasError: boolean;
  readonly namedChildren: readonly ConcreteNode[];
  childForFieldName(name: string): ConcreteNode | null;
}

export interface TreeDeclarations {
  enums: Enum[];
  types: Type[];
}

// Migration entry point, deliberately separate from read/parse. Unsupported
// constructs and recovered trees fail explicitly instead of yielding an AST
// that silently loses declarations. Recovery and the remaining constructs
// must be implemented before this can replace the shared syntax reader.
export function declarationsFromTree(source: string, root: ConcreteNode): TreeDeclarations {
  if (root.hasError) throw new Error("Cannot lower a tree with syntax errors");
  if (root.type !== "source_file") throw new Error(`Expected source_file, got ${root.type}`);

  const unsupported = (node: ConcreteNode): never => {
    throw new Error(`Unsupported syntax node: ${node.type}`);
  };
  const field = (node: ConcreteNode, name: string): ConcreteNode => {
    const value = node.childForFieldName(name);
    if (!value) throw new Error(`Missing ${name} field on ${node.type}`);
    return value;
  };
  const lineStarts = [source.startsWith("\uFEFF") ? 1 : 0];
  for (const ending of source.matchAll(/\r\n|\r|\n/g)) {
    lineStarts.push(ending.index + ending[0].length);
  }
  const located = (node: ConcreteNode): Located => {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= node.startIndex) low = middle;
      else high = middle;
    }
    return {
      name:
        node.type === "qualified_name"
          ? node.namedChildren
              .filter((child) => child.type === "identifier")
              .map((child) => child.text)
              .join(".")
          : node.text,
      line: low + 1,
      column: [...source.slice(lineStarts[low], node.startIndex)].length + 1,
      length: [...node.text].length,
    };
  };
  const documentation = (node: ConcreteNode): { documentation?: Documentation } => {
    const block = node.childForFieldName("documentation");
    if (!block) return {};
    const description: string[] = [];
    const tags: DocumentationTag[] = [];
    let active: DocumentationTag | undefined;
    for (const part of block.namedChildren) {
      if (part.type === "documentation_tag") {
        const target = part.childForFieldName("target");
        active = {
          ...located(field(part, "name")),
          ...(target ? { target: located(target) } : {}),
          description: part.childForFieldName("description")?.text.trim() ?? "",
        };
        tags.push(active);
      } else if (part.type === "documentation_text") {
        const text = part.text.trim();
        // One space after ## is the normal prose margin; an additional space
        // or a tab is the explicit continuation indent.
        if (active && /^(?: {2}|[ \t]*\t)/.test(part.text)) {
          active.description = [active.description, text].filter(Boolean).join("\n");
        } else {
          active = undefined;
          description.push(text);
        }
      } else unsupported(part);
    }
    return { documentation: { description: description.join("\n"), tags } };
  };
  const enumeration = (node: ConcreteNode): Enum => ({
    ...located(field(node, "name")),
    ...documentation(node),
    values: node.namedChildren.filter((child) => child.type === "value").map(located),
  });
  const stateField = (node: ConcreteNode): State => ({
    ...located(field(node, "name")),
    enum: located(field(node, "type")),
  });
  const state = (node: ConcreteNode): State[] => {
    const docs = documentation(node);
    const states = node.namedChildren
      .filter((child) => child.type === "state_field")
      .map((child) => ({
        ...stateField(child),
        ...docs,
      }));
    const value = node.childForFieldName("value");
    const first = states[0];
    if (value && first) {
      if (value.type === "when_expression") {
        const branches: Branch[] = [];
        for (const child of value.namedChildren) {
          if (child.type === "comment" || child.type === "identifier") continue;
          if (child.type !== "when_branch") unsupported(child);
          const result = field(child, "result");
          const values = child.namedChildren
            .filter((entry) => entry.type === "value" && entry.startIndex !== result.startIndex)
            .map(located);
          const otherwise =
            values.length === 1 && values[0]?.name === "else" ? values[0] : undefined;
          branches.push({
            values: otherwise ? [] : values,
            result: located(result),
            ...(otherwise ? { otherwise } : {}),
          });
        }
        first.derived = { dimension: located(field(value, "subject")), branches };
      } else if (value.type === "value") first.fixed = located(value);
      else unsupported(value);
    }
    return states;
  };
  const type = (node: ConcreteNode): Type => {
    const result: Type = {
      ...located(field(node, "name")),
      ...documentation(node),
      needs: [],
      states: [],
      rules: [],
      enums: [],
      types: [],
      children: [],
      unions: [],
      provides: [],
      actions: [],
      triggers: [],
      alikes: [],
      events: [],
    };
    for (const child of node.namedChildren) {
      switch (child.type) {
        case "identifier":
        case "documentation":
          break;
        case "needs":
          result.needs.push(...child.namedChildren.map(located));
          break;
        case "receives":
          result.states.push(
            ...child.namedChildren.map((entry) => ({
              ...stateField(entry),
              received: true as const,
            })),
          );
          break;
        case "type_body":
          for (const member of child.namedChildren) {
            switch (member.type) {
              case "comment":
                break;
              case "enum_declaration":
                result.enums.push(enumeration(member));
                break;
              case "type_declaration":
                result.types.push(type(member));
                break;
              case "state_declaration":
                result.states.push(...state(member));
                break;
              default:
                unsupported(member);
            }
          }
          break;
        default:
          unsupported(child);
      }
    }
    return result;
  };
  const result: TreeDeclarations = { enums: [], types: [] };
  for (const node of root.namedChildren) {
    switch (node.type) {
      case "comment":
        break;
      case "enum_declaration":
        result.enums.push(enumeration(node));
        break;
      case "type_declaration":
        result.types.push(type(node));
        break;
      default:
        unsupported(node);
    }
  }
  return result;
}
