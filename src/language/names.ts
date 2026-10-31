import type { Declaration, ParseResult } from "./ast.js";

export type Kind = "enum" | "dimension" | "type" | "environment" | "profile" | "record";

export const article = (word: string) => (/^[AEIOUaeiou]/.test(word) ? "an" : "a");

// The names the file declares, by kind, for checking the names that refer to
// them.
export class Names {
  private readonly kinds = new Map<string, Kind>();

  constructor(private readonly file: ParseResult) {
    for (const [kind, list] of this.lists()) {
      for (const { name } of list) if (!this.kinds.has(name)) this.kinds.set(name, kind);
    }
  }

  private lists(): [Kind, Declaration[]][] {
    const { enums, dimensions, types, environments, profiles, records } = this.file;
    return [
      ["enum", enums],
      ["dimension", dimensions],
      ["type", types],
      ["environment", environments],
      ["profile", profiles],
      ["record", records],
    ];
  }

  private of(kind: Kind): Declaration[] {
    return this.lists().find(([candidate]) => candidate === kind)?.[1] ?? [];
  }

  // What a name is, from its first declaration.
  kindOf(name: string): Kind | undefined {
    return this.kinds.get(name);
  }

  is(name: string, kind: Kind): boolean {
    return this.of(kind).some((declaration) => declaration.name === name);
  }

  // Why a name is not of a kind, or of any of several: what it is instead,
  // or what there is to choose from.
  not(name: string, ...kinds: Kind[]): string {
    const wanted = kinds.map((kind) => `${article(kind)} ${kind}`).join(" or ");
    const actual = this.kinds.get(name);
    if (actual !== undefined) return `${name} is ${article(actual)} ${actual}, not ${wanted}`;
    const names = kinds.flatMap((kind) => this.of(kind).map((declaration) => declaration.name));
    return `${name} is not ${wanted}${among(names)}`;
  }

  // The values of an enum or a dimension, unless it is broken.
  values(name: string): string[] | undefined {
    const declaration = [...this.file.enums, ...this.file.dimensions].find(
      (candidate) => candidate.name === name,
    );
    return declaration?.broken ? undefined : declaration?.values.map((item) => item.name);
  }
}

// The names to choose from, after a name that is not one of them.
export function among(names: string[], none = "the file declares none"): string {
  return names.length > 0 ? ` (${names.join(", ")})` : `; ${none}`;
}
