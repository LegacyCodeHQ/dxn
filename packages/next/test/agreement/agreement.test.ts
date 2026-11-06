import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEnum, enumValues } from "@next/check/enumeration.js";
import type { EnumDeclaration, Value } from "@next/model/enumeration.js";
import { parse } from "@next/syntax/parse.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The same declarations through this implementation and through the Lean
// specification, run as `lake exe dxn-spec`. They must agree on what is
// accepted, which problems are reported for which names in which order, and
// which values an accepted declaration has. Positions and messages are this
// implementation's own, and its other tests cover them.
//
// This tests agreement on these cases; it does not prove the implementation.

interface Case {
  title: string;
  name: string;
  values: string[];
}

interface Said {
  problems: { kind: string; name?: string }[];
  values: Value[] | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const lean = join(here, "../../../../lean");
const shared: Case[] = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));

// A small seeded generator, so a failing case is the same on every run.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Names that pass and names that break each rule, so most cases mix both.
const enumNames = ["Light", "Power", "UIState", "L", "light", "2Light", "Li-ght", "Lïght", ""];
const valueNames = [
  ...["off", "on", "dim", "no-keyboard", "19px", "2", "enum"],
  ...["Off", "a--b", "dim-", "-a", "no_keyboard", "ön", ""],
];

function generated(count: number): Case[] {
  const next = random(20261106);
  const pick = (names: string[]) => names[Math.floor(next() * names.length)] ?? "";
  return Array.from({ length: count }, (_, index) => ({
    title: `generated ${index}`,
    name: pick(enumNames),
    values: Array.from({ length: Math.floor(next() * 7) }, () => pick(valueNames)),
  }));
}

// Each case again with its values reversed: order must mean nothing to either.
const reversed = (cases: Case[]): Case[] =>
  cases.map((c) => ({ ...c, title: `${c.title}, reversed`, values: [...c.values].reverse() }));

const cases = [...shared, ...reversed(shared), ...generated(500)];

// A declaration as the parser would give it; positions do not matter here.
const at = { start: 0, end: 0 };
const declaration = ({ name, values }: Case): EnumDeclaration => ({
  name: { text: name, span: at },
  values: values.map((text) => ({ text, span: at })),
  span: at,
});

function said(d: EnumDeclaration): Said {
  const problems = checkEnum(d).map((problem) =>
    "name" in problem ? { kind: problem.kind, name: problem.name } : { kind: problem.kind },
  );
  return { problems, values: problems.length === 0 ? enumValues(d) : null };
}

// A case as text, when every name can be written as a word.
const word = /^[\p{L}\p{N}_-]+$/u;
const text = ({ name, values }: Case) =>
  [name, ...values].every((n) => word.test(n))
    ? `enum ${name} {\n${values.map((v) => `  ${v}`).join(",\n")}\n}\n`
    : undefined;

let spec: Said[] = [];
let folder = "";

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "dxn-agreement-"));
  const input = join(folder, "cases.json");
  writeFileSync(input, JSON.stringify(cases.map(({ name, values }) => ({ name, values }))));
  const lake = process.env.LAKE ?? "lake";
  const run = spawnSync(lake, ["exe", "dxn-spec", input], { cwd: lean, encoding: "utf8" });
  if (run.error) throw new Error(`cannot run ${lake}: ${run.error.message}; set LAKE to its path`);
  if (run.status !== 0) throw new Error(`dxn-spec failed:\n${run.stderr}`);
  spec = JSON.parse(run.stdout);
});

afterAll(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe("this implementation and the Lean specification", () => {
  it("say the same about every case", () => {
    expect(spec).toHaveLength(cases.length);
    const disagreements = cases
      .map((c, index) => ({ case: c, ours: said(declaration(c)), lean: spec[index] }))
      .filter(({ ours, lean }) => JSON.stringify(ours) !== JSON.stringify(lean));
    expect(disagreements).toEqual([]);
  });

  it("say the same when each case is written as text and read by the parser", () => {
    const disagreements = cases.flatMap((c, index) => {
      const source = text(c);
      if (source === undefined) return [];
      const { declarations, problems } = parse(source);
      const [only] = declarations;
      const ours =
        problems.length === 0 && only && declarations.length === 1 ? said(only) : problems;
      return JSON.stringify(ours) === JSON.stringify(spec[index])
        ? []
        : [{ case: c, source, ours, lean: spec[index] }];
    });
    expect(disagreements).toEqual([]);
  });

  it("cover accepted and rejected cases, and every kind of problem", () => {
    const kinds = new Set(spec.flatMap(({ problems }) => problems.map(({ kind }) => kind)));
    const accepted = spec.filter(({ values }) => values !== null).length;
    expect({
      kinds: [...kinds].sort(),
      accepted: accepted > 0,
      rejected: accepted < spec.length,
    }).toMatchInlineSnapshot(`
        {
          "accepted": true,
          "kinds": [
            "badEnumName",
            "badValueName",
            "duplicate",
            "empty",
          ],
          "rejected": true,
        }
      `);
  });
});
