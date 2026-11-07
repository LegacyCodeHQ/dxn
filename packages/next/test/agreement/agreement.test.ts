import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { combinationCounts, listCombinations } from "@next/analysis/combinations.js";
import { acceptFile } from "@next/check/file.js";
import type { Value } from "@next/model/enumeration.js";
import { isType, type Declaration as ParsedDeclaration } from "@next/model/type.js";
import { renameEnum } from "@next/refactor/rename.js";
import { parse } from "@next/syntax/parse.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The same files through this implementation and through the Lean
// specification, run as `lake exe dxn-spec`. They must agree on what is
// accepted, which problems are reported for which names in which order, which
// values an accepted file has, and, for a rename, every reason it is refused or
// the declarations it gives. Positions and messages are this
// implementation's own, and its other tests cover them.
//
// This tests agreement on these cases; it does not prove the implementation.

type Declaration =
  | { name: string; values: string[] }
  | { kind: "type"; name: string; varies: string[] };
type Enumeration = Extract<Declaration, { values: string[] }>;

interface Case {
  title: string;
  declarations: Declaration[];
  rename?: { from: string; to: string };
}

interface Said {
  problems: {
    kind: string;
    rule: string;
    name: string;
    problem?: { kind: string; rule: string; name?: string };
  }[];
  values: Value[] | null;
  combinations: { type: string; combinations: Value[][] }[] | null;
  rename?: {
    refusals: { kind: string; rule: string; name?: string }[];
    declarations: Declaration[] | null;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const lean = join(here, "../../../../lean");
const read = <T>(name: string): T => JSON.parse(readFileSync(join(here, name), "utf8"));
// Each shared enumeration is a file of its own; files.json holds files of several.
const shared: Case[] = [
  ...read<(Declaration & { title: string })[]>("cases.json").map(({ title, ...declaration }) => ({
    title,
    declarations: [declaration],
  })),
  ...read<Case[]>("files.json"),
  ...read<Case[]>("types.json"),
  ...read<Case[]>("renames.json"),
];

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

function generated(enums: number, files: number): Case[] {
  const next = random(20261106);
  const pick = (names: string[]) => names[Math.floor(next() * names.length)] ?? "";
  const declaration = (names: string[]): Enumeration => ({
    name: pick(names),
    values: Array.from({ length: Math.floor(next() * 7) }, () => pick(valueNames)),
  });
  // Few enumeration names in files, so that two declarations often share one.
  const fileNames = ["Light", "Power", "Theme", "light"];
  // Renames from and to names that are taken, missing, or break the rules.
  const renameNames = ["Light", "Power", "Theme", "Lamp", "Bulb", "light"];
  const rename = () => ({ from: pick(renameNames), to: pick(renameNames) });
  // Files with no problems, so that most renames get past the file's own check.
  const valid = (): Enumeration[] =>
    ["Light", "Power", "Theme"]
      .filter(() => next() < 0.6)
      .map((name) => ({ name, values: ["off", "on", "dim"].filter(() => next() < 0.7) }))
      .filter(({ values }) => values.length > 0);
  return [
    ...Array.from({ length: enums }, (_, index) => ({
      title: `generated enumeration ${index}`,
      declarations: [declaration(enumNames)],
    })),
    ...Array.from({ length: files }, (_, index) => ({
      title: `generated file ${index}`,
      declarations: Array.from({ length: Math.floor(next() * 5) }, () => declaration(fileNames)),
      rename: rename(),
    })),
    ...Array.from({ length: files }, (_, index) => ({
      title: `generated valid file ${index}`,
      declarations: valid(),
      rename: rename(),
    })),
  ];
}

// Mixed declarations exercise forward resolution, cross-kind collisions and rename references.
function generatedTypes(): Case[] {
  const next = random(20261107);
  const pick = (xs: string[]) => xs[Math.floor(next() * xs.length)] ?? "";
  return Array.from({ length: 250 }, (_, index) => {
    const enums: Declaration[] = ["Kind", "State"].map((name) => ({
      name,
      values: next() < 0.5 ? ["off"] : ["off", "on"],
    }));
    const types: Declaration[] = ["Button", "Menu"].map((name) => ({
      kind: "type",
      name: next() < 0.15 ? "button" : name,
      varies: Array.from({ length: Math.floor(next() * 4) }, () =>
        pick(["Kind", "State", "Missing", "Button"]),
      ),
    }));
    return {
      title: `generated mixed file ${index}`,
      declarations: index % 2 ? [...enums, ...types] : [...types, ...enums],
      rename: {
        from: pick(["Kind", "State", "Button", "Missing"]),
        to: pick(["Glow", "Kind", "State", "Button", "bad"]),
      },
    };
  });
}

// Each case again with its values reversed: order must mean nothing to either.
const reversed = (cases: Case[]): Case[] =>
  cases.map(({ title, declarations, rename }) => ({
    title: `${title}, reversed`,
    declarations: declarations.map((d) =>
      "values" in d
        ? { name: d.name, values: [...d.values].reverse() }
        : { ...d, varies: [...d.varies].reverse() },
    ),
    ...(rename && { rename }),
  }));

// JSON with every object's keys sorted, so field order does not matter.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

const cases = [...shared, ...reversed(shared), ...generated(500, 300), ...generatedTypes()];

// A declaration as the parser would give it; positions do not matter here.
const at = { start: 0, end: 0 };
const declaration = (d: Declaration): ParsedDeclaration =>
  "values" in d
    ? {
        name: { text: d.name, span: at },
        values: d.values.map((text) => ({ text, span: at })),
        span: at,
      }
    : {
        kind: "type",
        name: { text: d.name, span: at },
        varies: d.varies.map((text) => ({ text, span: at })),
        span: at,
      };

function said(declarations: readonly ParsedDeclaration[]): Said {
  const accepted = acceptFile(declarations);
  const problems = accepted.problems.map((problem) =>
    problem.kind === "duplicateName"
      ? { kind: problem.kind, rule: problem.rule, name: problem.name }
      : {
          kind: problem.kind,
          rule: problem.rule,
          name: problem.name,
          problem:
            "name" in problem.problem
              ? {
                  kind: problem.problem.kind,
                  rule: problem.problem.rule,
                  name: problem.problem.name,
                }
              : { kind: problem.problem.kind, rule: problem.problem.rule },
        },
  );
  return {
    problems,
    values: accepted.file?.values ?? null,
    combinations: accepted.file?.combinations ?? null,
  };
}

// A case as text, when every name can be written as a word.
const word = /^[\p{L}\p{N}_-]+$/u;
const text = ({ declarations }: Case) =>
  declarations.every((d) =>
    [d.name, ...("values" in d ? d.values : d.varies)].every((n) => word.test(n)),
  )
    ? declarations
        .map((d) =>
          "values" in d
            ? `enum ${d.name} {\n${d.values.map((v) => `  ${v}`).join(",\n")}\n}\n`
            : `type ${d.name} {${d.varies.length ? ` varies ${d.varies.join(", ")} ` : " "}}\n`,
        )
        .join("")
    : undefined;

let spec: Said[] = [];
let folder = "";

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "dxn-agreement-"));
  const input = join(folder, "cases.json");
  writeFileSync(
    input,
    JSON.stringify(
      cases.map(({ declarations, rename }) => ({ declarations, ...(rename && { rename }) })),
    ),
  );
  const lake = process.env.LAKE ?? "lake";
  const run = spawnSync(lake, ["exe", "dxn-spec", input], { cwd: lean, encoding: "utf8" });
  if (run.error) throw new Error(`cannot run ${lake}: ${run.error.message}; set LAKE to its path`);
  if (run.status !== 0) throw new Error(`dxn-spec failed:\n${run.stderr}`);
  spec = JSON.parse(run.stdout);
});

afterAll(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
});

// What the specification says about the file itself, without the rename.
const checked = ({ problems, values, combinations }: Said) =>
  canonical({ problems, values, combinations });

// What this implementation says about a rename, done on the case written as text.
function renamed(source: string, { from, to }: { from: string; to: string }): Said["rename"] {
  const result = renameEnum(source, from, to);
  return {
    refusals: result.refusals.map((refusal) =>
      "name" in refusal
        ? { kind: refusal.kind, rule: refusal.rule, name: refusal.name }
        : { kind: refusal.kind, rule: refusal.rule },
    ),
    declarations:
      result.source === undefined
        ? null
        : parse(result.source).declarations.map((d) =>
            isType(d)
              ? { kind: "type", name: d.name.text, varies: d.varies.map((n) => n.text) }
              : { name: d.name.text, values: d.values.map((v) => v.text) },
          ),
  };
}

describe("this implementation and the Lean specification", () => {
  it("say the same about every case", () => {
    expect(spec).toHaveLength(cases.length);
    const disagreements = cases
      .map((c, index) => ({
        case: c,
        ours: said(c.declarations.map(declaration)),
        lean: spec[index],
      }))
      .filter(({ ours, lean }) => lean === undefined || canonical(ours) !== checked(lean));
    expect(disagreements).toEqual([]);
  });

  it("say the same when each case is written as text and read by the parser", () => {
    const disagreements = cases.flatMap((c, index) => {
      const source = text(c);
      const lean = spec[index];
      if (source === undefined || lean === undefined) return [];
      const { declarations, problems } = parse(source);
      const ours =
        problems.length === 0 && declarations.length === c.declarations.length
          ? said(declarations)
          : problems;
      return canonical(ours) === checked(lean) ? [] : [{ case: c, source, ours, lean }];
    });
    expect(disagreements).toEqual([]);
  });

  it("say the same about every rename", () => {
    const disagreements = cases.flatMap((c, index) => {
      const source = text(c);
      const lean = spec[index]?.rename;
      if (source === undefined || c.rename === undefined) return [];
      const ours = renamed(source, c.rename);
      return canonical(ours) === canonical(lean) ? [] : [{ case: c, source, ours, lean }];
    });
    expect(disagreements).toEqual([]);
  });

  it("lists and counts exactly the combinations Lean gives each accepted file", () => {
    const disagreements = cases.flatMap((c, index) => {
      const source = text(c),
        expected = spec[index];
      if (source === undefined || !expected || expected.combinations === null) return [];
      const listed = listCombinations(source);
      const counts = combinationCounts(source).map(({ type, count }) => ({ type, count }));
      const combinations = expected.combinations.map((t) => ({
        type: t.type,
        count: t.combinations.length,
        combinations: t.combinations.map((row) =>
          Object.fromEntries(row.map((v) => [v.enum, v.name])),
        ),
      }));
      const ours =
        listed.kind === "listed"
          ? listed.types.map(({ type, count, combinations }) => ({ type, count, combinations }))
          : listed;
      const wantedCounts = combinations.map(({ type, count }) => ({ type, count: String(count) }));
      return canonical(ours) === canonical(combinations) &&
        canonical(counts) === canonical(wantedCounts)
        ? []
        : [{ case: c, ours, combinations, counts }];
    });
    expect(disagreements).toEqual([]);
  });

  it("cover accepted and rejected cases, and every kind of problem and refusal", () => {
    const kinds = new Set(
      spec.flatMap(({ problems }) => problems.map(({ kind, problem }) => problem?.kind ?? kind)),
    );
    const refusals = new Set(
      spec.flatMap(({ rename }) => rename?.refusals.map(({ kind }) => kind) ?? []),
    );
    const accepted = spec.filter(({ values }) => values !== null).length;
    const renames = spec.filter(({ rename }) => rename !== undefined);
    const done = renames.filter(({ rename }) => rename?.declarations !== null).length;
    expect({
      kinds: [...kinds].sort(),
      rules: [
        ...new Set(
          spec.flatMap((result) => [
            ...result.problems.map((p) => p.rule),
            ...(result.rename?.refusals.map((r) => r.rule) ?? []),
          ]),
        ),
      ].sort(),
      accepted: accepted > 0,
      rejected: accepted < spec.length,
      refusals: [...refusals].sort(),
      renamed: done > 0,
      refused: done < renames.length,
    }).toMatchInlineSnapshot(`
      {
        "accepted": true,
        "kinds": [
          "badEnumName",
          "badTypeName",
          "badValueName",
          "duplicate",
          "duplicateName",
          "duplicateVaries",
          "empty",
          "noSuchEnum",
        ],
        "refusals": [
          "badEnumName",
          "fileHasProblems",
          "nameExists",
          "noSuchEnum",
        ],
        "refused": true,
        "rejected": true,
        "renamed": true,
        "rules": [
          "E1",
          "E2",
          "E3",
          "E4",
          "F1",
          "RE1",
          "RE2",
          "RE3",
          "RE4",
          "T1",
          "T2",
          "T3",
        ],
      }
    `);
  });
});
