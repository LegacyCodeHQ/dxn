import type { Declaration, ParseResult, Type } from "./ast.js";
import { penNode, scalars } from "./scalars.js";

export type Kind =
  | "enum"
  | "dimension"
  | "type"
  | "environment"
  | "profile"
  | "modifier"
  | "record"
  | "actor"
  | "scalar";

export const article = (word: string) => (/^[AEIOUaeiou]/.test(word) ? "an" : "a");

// The names the file declares, by kind, and the built-in scalars, for
// checking the names that refer to them. A scalar's name stays a scalar, even
// where the file declares it.
export class Names {
  private readonly kinds = new Map<string, Kind>();

  constructor(private readonly file: ParseResult) {
    for (const { name } of scalars) this.kinds.set(name, "scalar");
    this.kinds.set(penNode.name, "scalar");
    for (const [kind, list] of this.lists()) {
      for (const { name } of list) if (!this.kinds.has(name)) this.kinds.set(name, kind);
    }
  }

  private lists(): [Kind, Declaration[]][] {
    const { enums, dimensions, types, environments, profiles, modifiers, records, actors } =
      this.file;
    return [
      ["enum", enums],
      ["dimension", dimensions],
      ["type", types],
      ["environment", environments],
      ["profile", profiles],
      ["modifier", modifiers],
      ["record", records],
      ["actor", actors],
    ];
  }

  private of(kind: Kind): string[] {
    if (kind === "scalar") return [...scalars.map(({ name }) => name), penNode.name];
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
    return `${name} is not ${wanted}${among(
      name,
      kinds.flatMap((kind) => this.of(kind)),
    )}`;
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

// What to say after a name that is not one of these: the ones close to it, as
// a suggestion, closest first; or, when none is close, all of them.
// How close is close is measured on so many of the written name's characters:
// all of them, or only those of its last part, when the names to choose from
// share the rest.
export function among(
  written: string,
  names: string[],
  none = "the file declares none",
  measured = written.length,
): string {
  if (names.length === 0) return `; ${none}`;
  const close = names
    .map((name) => ({ name, distance: distance(written, name) }))
    .filter(({ distance: apart }) => apart <= Math.max(1, Math.floor(measured / 3)))
    .sort((a, b) => a.distance - b.distance);
  if (close.length === 0) return ` (${names.join(", ")})`;
  const each = close.map(({ name }) => name);
  const said = each.length > 1 ? `${each.slice(0, -1).join(", ")} or ${each.at(-1)}` : each[0];
  return `; did you mean ${said}?`;
}

// How many edits apart two names are: a character added, removed, changed, or
// swapped with the next, ignoring case, which counts as no edit only when it
// is the whole difference.
function distance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return a === b ? 0 : 0.5;
  const rows = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => rows[i]?.[j] ?? 0;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      (rows[i] as number[])[j] = best;
    }
  }
  return at(x.length, y.length);
}
