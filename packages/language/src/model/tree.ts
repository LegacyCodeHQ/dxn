import type { Child, ResolvedResult, Type } from "@language/core/ast.js";
import { message } from "@language/core/message.js";
import { conditionText } from "@language/model/condition.js";
import { among } from "@language/model/names.js";

// A type declaration expanded through its has placements. Conditions are kept
// as expressions, not evaluated; a shared type appears once per placement.
export interface TypeTree {
  name: string;
  type: string;
  path: string;
  list?: true;
  when?: string;
  children: TypeTree[];
}

// Without a selection, show types not placed by another type. Nested type
// declarations are addressed by their qualified names, not treated as has nodes.
export function typeTrees(file: ResolvedResult, selected?: string): TypeTree[] {
  if (file.diagnostics.some(({ severity }) => severity === "error")) {
    throw new Error("cannot show a tree for a file with problems");
  }
  const types = new Map(file.types.map((type) => [type.name, type]));
  const find = (name: string): Type => {
    const type = types.get(name);
    if (type === undefined) {
      throw new Error(message`no type ${name}${among(name, [...types.keys()])}`);
    }
    return type;
  };
  const walk = (type: Type, path: string, placement?: Child): TypeTree => ({
    name: placement?.name ?? type.name,
    type: type.name,
    path,
    ...(placement?.list ? { list: true as const } : {}),
    ...(placement?.when ? { when: conditionText(placement.when) } : {}),
    children: type.children.map((child) =>
      walk(find(child.type.name), `${path}.${child.name}`, child),
    ),
  });
  if (selected !== undefined) return [walk(find(selected), selected)];
  const contained = new Set(
    file.types.flatMap(({ children }) => children.map(({ type }) => type.name)),
  );
  return file.types.filter(({ name }) => !contained.has(name)).map((type) => walk(type, type.name));
}

// The same declared structure as text, suitable for a terminal or a document.
export function printTypeTrees(trees: TypeTree[], options: { identifiers?: boolean } = {}): string {
  if (trees.length === 0) return "No types declared.\n";
  const draw = (root: TypeTree): string => {
    const lines = [root.type];
    const children = (parent: TypeTree, prefix: string) => {
      parent.children.forEach((child, index) => {
        const last = index === parent.children.length - 1;
        const type = child.list ? `[${child.type}]` : child.type;
        const condition = child.when === undefined ? "" : ` only when ${child.when}`;
        const label = options.identifiers ? `${child.name}: ${type}` : type;
        lines.push(`${prefix}${last ? "└── " : "├── "}${label}${condition}`);
        children(child, prefix + (last ? "    " : "│   "));
      });
    };
    children(root, "");
    return lines.join("\n");
  };
  return `${trees.map(draw).join("\n\n")}\n`;
}
