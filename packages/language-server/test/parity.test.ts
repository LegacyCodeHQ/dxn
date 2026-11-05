import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run } from "@cli/cli.js";
import { diagnose } from "@language-server/protocol/diagnostics.js";
import { evidence } from "@language-server/protocol/evidence.js";
import { serve } from "@language-server/server.js";
import { parse } from "@legacycodehq/dxn-language";
import { dxn as invocation } from "@vscode/run.js";
import { afterAll, describe, expect, it } from "vitest";
import {
  CodeLensRequest,
  createConnection,
  createMessageConnection,
  DidOpenTextDocumentNotification,
  DocumentFormattingRequest,
  InitializeRequest,
  type MessageConnection,
  RenameFile,
  RenameRequest,
  ShowMessageNotification,
  StreamMessageReader,
  StreamMessageWriter,
  TextDocumentEdit,
  TextEdit,
} from "vscode-languageserver/node";

// dxn and an editor must agree: each scenario, a file and the records stored
// beside it, is run through the dxn command and through the language server,
// and the two must find the same problems, refuse the same renames and make
// the same ones, and format the file the same. A rule added to one and not to
// the other fails here.

interface Scenario {
  title: string;
  dxn: string;
  stored?: Record<string, string>;
  // A rename, at a line and a column of the file, both from one.
  rename?: { line: number; column: number; to: string; collision?: string };
}

const model = `enum Hover = rest | hovered
enum Focus = blurred | focused
type Link {
  state hover: Hover, focus: Focus
}
record Evidence {
  note: NonEmptyString
}
actor Designer records Evidence
`;
const entry = (hover: string, note = "Seen.") =>
  `{ "context": { "type": "Link", "dimensions": {}, "states": { "hover": "${hover}", "focus": "blurred" } }, "actor": "Designer", "note": "${note}" }`;
const records = (...entries: string[]) => `[\n  ${entries.join(",\n  ")}\n]\n`;

const mixedRecords: Scenario = {
  title: "a record no actor records alongside invalid recorded evidence",
  dxn: `${model}record Note {\n  text: NonEmptyString\n}\n`,
  stored: { "note/a.json": "[]", "evidence/a.json": records(entry("bogus")) },
  rename: { line: 1, column: 15, to: "still" },
};

const scenarios: Scenario[] = [
  {
    title: "an unknown documentation tag",
    dxn: model.replace("enum Hover", "## @bogus rest Description.\nenum Hover"),
  },
  {
    title: "an unknown documentation target",
    dxn: model.replace("enum Hover", "## @value missing Description.\nenum Hover"),
  },
  {
    title: "a documentation tag on the wrong declaration",
    dxn: model.replace("enum Hover", "## @state rest Description.\nenum Hover"),
  },
  {
    title: "a missing documentation target",
    dxn: model.replace("enum Hover", "## @value\nenum Hover"),
  },
  {
    title: "a later duplicate documentation warning",
    dxn: model.replace("enum Hover", "## @value rest First.\n## @value rest Second.\nenum Hover"),
  },
  {
    title: "attached documentation on a shared parser declaration",
    dxn: model.replace("enum Hover", "## Interaction.\n## @value rest At rest.\nenum Hover"),
  },
  {
    title: "mixed ordinary and documentation comments",
    dxn: model.replace("enum Hover", "## Interaction.\n# Ordinary.\nenum Hover"),
  },
  {
    title: "malformed documentation tag syntax",
    dxn: model.replace("enum Hover", "## @\nenum Hover"),
  },
  {
    title: "a file and stored records that check",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 1, column: 15, to: "still" },
  },
  { title: "a syntax error", dxn: model.replace("enum Focus =", "enum Focus") },
  {
    title: "an error in checking, with stored records",
    dxn: model.replace("state hover: Hover", "state hover: Hovr"),
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 2, column: 15, to: "unfocused" },
  },
  { title: "an unused enum, a warning", dxn: `${model}enum Size = sm\n` },
  {
    title: "a stored value the enum does not have",
    dxn: model,
    stored: { "evidence/a.json": records(entry("bogus")) },
    rename: { line: 1, column: 15, to: "still" },
  },
  {
    title: "a stored record twice, across files",
    dxn: model,
    stored: {
      "evidence/a.json": records(entry("rest")),
      "evidence/b.json": records(entry("rest")),
    },
    rename: { line: 1, column: 15, to: "still" },
  },
  {
    title: "records stored for a record no actor records",
    dxn: model.replace("actor Designer records Evidence\n", ""),
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 1, column: 15, to: "still" },
  },
  {
    title: "a rename to a name a value cannot have",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 1, column: 15, to: "when" },
  },
  {
    title: "a rename of an enum",
    dxn: model,
    stored: { "evidence/a.json": records(entry("hovered")) },
    rename: { line: 1, column: 6, to: "Pointing" },
  },
  {
    title: "stored records made before their elements gained a state",
    dxn: model.replace(
      "type Link {\n  state hover: Hover, focus: Focus\n}",
      "type Link {\n  state hover: Hover, focus: Focus\n}\ntype Button {\n  state hover: Hover\n}",
    ),
    stored: {
      "evidence/a.json": records(
        entry("rest"),
        `{ "context": { "type": "Link", "dimensions": {}, "states": { "hover": "rest" } }, "actor": "Designer", "note": "Old." }`,
        `{ "context": { "type": "Button", "dimensions": {}, "states": {} }, "actor": "Designer", "note": "Older." }`,
      ),
    },
  },
  {
    title: "a rename of a type used by stored records",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 3, column: 6, to: "Button" },
  },
  {
    title: "a rename of a state used by stored records",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 4, column: 9, to: "pointing" },
  },
  {
    title: "a rename of an actor used by stored records",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 9, column: 7, to: "Reviewer" },
  },
  {
    title: "a record rename that moves its stored folder",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")) },
    rename: { line: 6, column: 8, to: "Proof" },
  },
  {
    title: "a record rename blocked by an existing folder",
    dxn: model,
    stored: { "evidence/a.json": records(entry("rest")), "proof/keep.txt": "keep" },
    rename: { line: 6, column: 8, to: "Proof" },
  },
  {
    title: "a dimension rename that collides with a later type declaration",
    dxn: "dimension Input = grammar | scanner\n\ntype TreeSitterPackage needs Input {}\n",
    rename: {
      line: 1,
      column: 11,
      to: "TreeSitterPackage",
      collision: "`TreeSitterPackage` is already declared as a type at line 3",
    },
  },
  {
    title: "a rename that collides with another value",
    dxn: model,
    rename: { line: 1, column: 15, to: "hovered" },
  },
  {
    title: "a failing expectation",
    dxn: `${model}expect "Impossible" {\n  in Link\n  then hover = rest\n}\n`,
  },
  {
    title: "a file not written the one way",
    dxn: model.replace("enum Hover = rest | hovered", "enum   Hover=rest|hovered"),
  },
];

const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

// A project holding the scenario's files, and where its file is.
function project({ dxn, stored = {} }: Scenario): { root: string; file: string } {
  const root = mkdtempSync(join(tmpdir(), "dxn-parity-"));
  folders.push(root);
  writeFileSync(join(root, "spec.dxn"), dxn);
  for (const [path, content] of Object.entries(stored)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return { root, file: join(root, "spec.dxn") };
}

// dxn, run in a project: its exit code, and what it printed.
function dxn(root: string, ...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(argv, {
    cwd: root,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

// A problem, as both sides are compared by it: the file it is in, its place,
// its severity and its code. A refusal of the whole, as dxn refuses records
// stored that no actor records, is the error an editor shows at the record.
const problem = (file: string, line: number, column: number, severity: string, code: string) =>
  `${file}:${line}:${column}: ${severity}: ${code}`;

// The problems dxn finds in the file and in its stored records.
function dxnProblems(root: string): string[] {
  const found = new Set<string>();
  for (const command of ["check", "validate"]) {
    const result = JSON.parse(dxn(root, command, "spec.dxn", "--json").stdout) as {
      error?: string;
      problems?: { file: string; line: number; column: number; severity: string; code: string }[];
    };
    for (const each of result.problems ?? []) {
      found.add(problem(each.file, each.line, each.column, each.severity, each.code));
    }
    if (result.error !== undefined) found.add(`refused: ${result.error}`);
  }
  return [...found].sort();
}

// The problems an editor shows for the file and its stored records: what the
// language server publishes.
function editorProblems(root: string, file: string): string[] {
  const text = readFileSync(file, "utf8");
  const uri = pathToFileURL(file).href;
  const parsed = parse(text);
  const found = new Set<string>();
  const add = (at: string, diagnostics: ReturnType<typeof diagnose>) => {
    for (const { range, severity, code, message } of diagnostics) {
      if (code === "unrecorded-record") {
        found.add(`refused: ${message}`);
        continue;
      }
      const shown = relative(root, fileURLToPath(at));
      const kind = severity === 1 ? "error" : "warning";
      found.add(
        problem(shown, range.start.line + 1, range.start.character + 1, kind, String(code)),
      );
    }
  };
  add(uri, diagnose(text, parsed));
  for (const [at, diagnostics] of evidence(uri, parsed, text) ?? new Map()) add(at, diagnostics);
  return [...found].sort();
}

// A language server and an editor talking over a pair of streams, the editor
// having opened the file.
async function editor(file: string): Promise<MessageConnection> {
  const toServer = new PassThrough();
  const toEditor = new PassThrough();
  serve(createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toEditor)));
  const connection = createMessageConnection(
    new StreamMessageReader(toEditor),
    new StreamMessageWriter(toServer),
  );
  connection.listen();
  await connection.sendRequest(InitializeRequest.type, {
    processId: null,
    rootUri: null,
    capabilities: {
      workspace: {
        workspaceEdit: { documentChanges: true, resourceOperations: ["rename"] },
      },
    },
  });
  await connection.sendNotification(DidOpenTextDocumentNotification.type, {
    textDocument: {
      uri: pathToFileURL(file).href,
      languageId: "dxn",
      version: 1,
      text: readFileSync(file, "utf8"),
    },
  });
  return connection;
}

// A text with an editor's edits made, each from its range's start.
function edited(text: string, edits: TextEdit[]): string {
  const offset = (line: number, character: number) => {
    const lines = text.split("\n");
    return lines.slice(0, line).reduce((sum, each) => sum + each.length + 1, 0) + character;
  };
  let result = text;
  for (const { range, newText } of [...edits].sort(
    (a, b) =>
      offset(b.range.start.line, b.range.start.character) -
      offset(a.range.start.line, a.range.start.character),
  )) {
    result =
      result.slice(0, offset(range.start.line, range.start.character)) +
      newText +
      result.slice(offset(range.end.line, range.end.character));
  }
  return result;
}

describe("dxn and an editor", () => {
  it.each([...scenarios, mixedRecords].map((scenario) => [scenario.title, scenario] as const))(
    "find the same problems: %s",
    (_, scenario) => {
      const { root, file } = project(scenario);
      expect(editorProblems(root, file)).toEqual(dxnProblems(root));
    },
  );

  it.each([
    ["validate", []],
    ["status", []],
    ["rename", ["Hover", "Pointing"]],
  ] as const)("reports other errors before refusing %s without writing", (command, args) => {
    const scenario = mixedRecords;
    const { root, file } = project(scenario);
    const result = dxn(root, command, "spec.dxn", ...args, "--json");
    const output = JSON.parse(result.stdout);
    expect({
      code: result.code,
      errors: output.problems?.map(({ code }: { code: string }) => code),
      refusal: output.error,
      source: readFileSync(file, "utf8"),
      stored: readFileSync(join(root, "evidence/a.json"), "utf8"),
    }).toEqual({
      code: 1,
      errors: ["unknown-value"],
      refusal:
        "`Note` is stored in note/, but no actor records it; declare `actor <name> records Note`",
      source: scenario.dxn,
      stored: scenario.stored?.["evidence/a.json"],
    });
  });

  it.each(
    [...scenarios, mixedRecords]
      .filter(({ rename }) => rename !== undefined)
      .map((scenario) => [scenario.title, scenario] as const),
  )("refuse and make the same renames: %s", async (_, scenario) => {
    const { root, file } = project(scenario);
    const { line, column, to } = scenario.rename as NonNullable<Scenario["rename"]>;
    // dxn, without writing: refused, or every file it would write.
    const cli = dxn(root, "rename", `spec.dxn:${line}:${column}`, to, "--dry-run", "--json");
    const plan =
      cli.code === 0
        ? (JSON.parse(cli.stdout) as {
            written: Record<string, string>;
            moved?: { from: string; to: string };
          })
        : undefined;
    // An editor: refused, as a message, or the edits, made to each file.
    const connection = await editor(file);
    try {
      const refusal = new Promise<string>((resolve) =>
        connection.onNotification(ShowMessageNotification.type, ({ message }) => resolve(message)),
      );
      const edit = await connection.sendRequest(RenameRequest.type, {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line: line - 1, character: column - 1 },
        newName: to,
      });
      if (plan === undefined) {
        const reason = await refusal;
        const collision = scenario.rename?.collision;
        if (collision !== undefined) {
          const output = JSON.parse(cli.stdout) as {
            problems: { code: string; message: string; line: number; column: number }[];
          };
          expect({
            edit,
            reason,
            problem: output.problems.find(({ code }) => code === "duplicate-name"),
            unchanged: readFileSync(file, "utf8") === scenario.dxn,
          }).toEqual({
            edit: null,
            reason: `the rename would leave a problem: ${collision}`,
            problem: expect.objectContaining({ message: collision, line, column }),
            unchanged: true,
          });
        } else {
          expect([edit, typeof reason]).toEqual([null, "string"]);
        }
        return;
      }
      const changes = edit?.documentChanges ?? [];
      const made = Object.fromEntries(
        [
          ...Object.entries(edit?.changes ?? {}),
          ...changes
            .filter(TextDocumentEdit.is)
            .map(({ textDocument, edits }) => [textDocument.uri, edits] as const),
        ].map(([uri, edits]) => {
          if (!edits.every(TextEdit.is)) throw new Error("rename returned a snippet edit");
          const path = fileURLToPath(uri);
          return [relative(root, path), edited(readFileSync(path, "utf8"), edits)];
        }),
      );
      const moved = changes.filter(RenameFile.is).map(({ oldUri, newUri }) => ({
        from: relative(root, fileURLToPath(oldUri)),
        to: relative(root, fileURLToPath(newUri)),
      }));
      expect({ written: made, moved }).toEqual({
        written: plan.written,
        moved: plan.moved === undefined ? [] : [plan.moved],
      });
    } finally {
      connection.dispose();
    }
  });

  it.each([
    [1, ["states", "Menu"], 0],
    [3, ["states", "Menu.Toggle"], 0],
    [8, ["check", "--expect", "Can open"], 0],
    [12, ["check", "--expect", "Always open"], 1],
  ] as const)("runs the same command from the code lens on line %s", async (line, args, code) => {
    const { root, file } = project({
      title: "nested types and independently selected expectations",
      dxn:
        'enum State = closed | open\ntype Menu {\n  state menu: State\n  type Toggle {\n    state expanded: State\n  }\n  has toggle: Toggle\n}\nexpect "Can open" {\n  in Menu\n  some menu = open\n}\n' +
        (args[0] === "check" ? 'expect "Always open" {\n  in Menu\n  then menu = open\n}\n' : ""),
    });
    const connection = await editor(file);
    try {
      const lenses = await connection.sendRequest(CodeLensRequest.type, {
        textDocument: { uri: pathToFileURL(file).href },
      });
      const lens = lenses?.find(({ range }) => range.start.line === line)?.command;
      const [uri, offered] = lens?.arguments ?? [];
      expect([lens?.command, uri, offered]).toEqual(["dxn.run", pathToFileURL(file).href, args]);
      const [, ...argv] = invocation(root, relative(root, fileURLToPath(uri)), offered);
      const direct = dxn(root, args[0], "spec.dxn", ...args.slice(1), "--json");
      expect(dxn(root, ...argv, "--json")).toEqual(direct);
      expect(direct.code, direct.stdout).toBe(code);
    } finally {
      connection.dispose();
    }
  });

  it.each(scenarios.map((scenario) => [scenario.title, scenario] as const))(
    "format the same: %s",
    async (_, scenario) => {
      const { root, file } = project(scenario);
      const before = readFileSync(file, "utf8");
      const connection = await editor(file);
      try {
        const edits = await connection.sendRequest(DocumentFormattingRequest.type, {
          textDocument: { uri: pathToFileURL(file).href },
          options: { tabSize: 2, insertSpaces: true },
        });
        const byEditor = edited(before, edits ?? []);
        dxn(root, "fmt", "spec.dxn");
        expect(byEditor).toBe(readFileSync(file, "utf8"));
      } finally {
        connection.dispose();
      }
    },
  );
});
