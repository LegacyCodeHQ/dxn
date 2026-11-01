import type { Declaration, ParseResult, Type } from "./ast.js";
import { scalars } from "./scalars.js";

export type Kind =
  | "enum"
  | "dimension"
  | "type"
  | "environment"
  | "profile"
  | "modifier"
  | "record"
  | "scalar";

export const article = (word: string) => (/^[AEIOUaeiou]/.test(word) ? "an" : "a");

// The names the file declares, by kind, and the built-in scalars, for
// checking the names that refer to them. A scalar's name stays a scalar, even
// where the file declares it.
export class Names {
  private readonly kinds = new Map<string, Kind>();

  constructor(private readonly file: ParseResult) {
    for (const { name } of scalars) this.kinds.set(name, "scalar");
    for (const [kind, list] of this.lists()) {
      for (const { name } of list) if (!this.kinds.has(name)) this.kinds.set(name, kind);
    }
  }

  private lists(): [Kind, Declaration[]][] {
    const { enums, dimensions, types, environments, profiles, modifiers, records } = this.file;
    return [
      ["enum", enums],
      ["dimension", dimensions],
      ["type", types],
      ["environment", environments],
      ["profile", profiles],
      ["modifier", modifiers],
      ["record", records],
    ];
  }

  private of(kind: Kind): string[] {
    if (kind === "scalar") return scalars.map(({ name }) => name);
    const list = this.lists().find(([candidate]) => candidate === kind)?.[1] ?? [];
    return list.map(({ name }) => name);
  }

  // What a name is, from its first declaration.
  kindOf(name: string): Kind | undefined {
    return this.kinds.get(name);
  }

  is(name: string, kind: Kind): boolean {
    return this.of(kind).includes(name);
  }

  // Why a name is not of a kind, or of any of several: what it is instead,
  // or what there is to choose from.
  not(name: string, ...kinds: Kind[]): string {
    const each = kinds.map((kind) => `${article(kind)} ${kind}`);
    const wanted =
      each.length > 1 ? `${each.slice(0, -1).join(", ")} or ${each.at(-1)}` : (each[0] ?? "");
    const actual = this.kinds.get(name);
    if (actual !== undefined) return `${name} is ${article(actual)} ${actual}, not ${wanted}`;
    return `${name} is not ${wanted}${among(kinds.flatMap((kind) => this.of(kind)))}`;
  }

  // The values of an enum or a dimension, unless it is broken.
  values(name: string): string[] | undefined {
    const declaration = [...this.file.enums, ...this.file.dimensions].find(
      (candidate) => candidate.name === name,
    );
    return declaration?.broken ? undefined : declaration?.values.map((item) => item.name);
  }
}

// The values an enum or a dimension declares, by its name, whether it is
// broken or not; none, for a name that is neither.
export function valuesOf(file: ParseResult, name: string): string[] {
  return (
    [...file.enums, ...file.dimensions]
      .find((declaration) => declaration.name === name)
      ?.values.map((value) => value.name) ?? []
  );
}

// What a type compares takes its values from: a state's enum, by the state's
// lowercase name, or a dimension, by its own; undefined for a state it lacks.
export function enumOf(type: Type, subject: string): string | undefined {
  return /^[a-z]/.test(subject)
    ? type.states.find((state) => state.name === subject)?.enum.name
    : subject;
}

// The names to choose from, after a name that is not one of them.
export function among(names: string[], none = "the file declares none"): string {
  return names.length > 0 ? ` (${names.join(", ")})` : `; ${none}`;
}
