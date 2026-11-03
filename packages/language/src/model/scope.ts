import type {
  Declaration,
  Enum,
  Located,
  ResolvedResult,
  SyntaxResult,
  Type,
} from "@language/core/ast.js";

// Gives the enums and types declared inside a type their full names,
// "<Type>.<Name>", and lists them with the file's own; then resolves each
// name a type or a record uses to the declaration it means, looking first in
// its own type, then in the types around it, and last in the file.
export function scope(file: SyntaxResult): ResolvedResult {
  const enter = (type: Type) => {
    const inside = <T extends Declaration>(declaration: T, list: T[]) => {
      declaration.short = declaration.name;
      declaration.scope = type.name;
      declaration.name = `${type.name}.${declaration.name}`;
      list.push(declaration);
    };
    for (const declaration of type.enums) inside(declaration, file.enums as Enum[]);
    for (const declaration of type.types) {
      inside(declaration, file.types);
      enter(declaration);
    }
  };
  for (const type of [...file.types]) if (type.scope === undefined) enter(type);

  const declared = new Set(
    [
      ...file.enums,
      ...file.dimensions,
      ...file.types,
      ...file.environments,
      ...file.profiles,
      ...file.modifiers,
      ...file.records,
    ].map(({ name }) => name),
  );
  const scopes = new Map(file.types.map((type) => [type.name, type.scope]));
  // The scopes a name is looked up in from a type, innermost first.
  const chain = (type: string | undefined) => {
    const result: string[] = [];
    for (let at = type; at !== undefined; at = scopes.get(at)) result.push(at);
    return result;
  };
  const resolve = (reference: Located, from: string | undefined) => {
    for (const at of chain(from)) {
      const full = `${at}.${reference.name}`;
      if (declared.has(full)) {
        reference.name = full;
        return;
      }
    }
  };
  for (const type of file.types) {
    for (const state of type.states) resolve(state.enum, type.name);
    for (const child of type.children) resolve(child.type, type.name);
  }
  // Resolution changes the existing object, not its runtime representation.
  return file as unknown as ResolvedResult;
}

// The names visible around a declaration inside a type, which it cannot
// repeat: those of the file, and of the types around its own, with where
// each is. Those in its own type are its siblings: a repeat among them is a
// repeat of the full name.
export function around(file: ResolvedResult, declaration: Declaration): Map<string, Located> {
  const visible = new Map<string, Located>();
  const all = [
    ...file.enums,
    ...file.dimensions,
    ...file.types,
    ...file.environments,
    ...file.profiles,
    ...file.modifiers,
    ...file.records,
  ];
  const scopes = new Map(file.types.map((type) => [type.name, type.scope]));
  const from = declaration.scope === undefined ? undefined : scopes.get(declaration.scope);
  for (let at = from; at !== undefined; at = scopes.get(at)) {
    for (const other of all) {
      if (other.scope === at && other !== declaration && other.short !== undefined) {
        if (!visible.has(other.short)) visible.set(other.short, other);
      }
    }
  }
  for (const other of all) {
    if (other.scope === undefined && !visible.has(other.name)) visible.set(other.name, other);
  }
  return visible;
}
