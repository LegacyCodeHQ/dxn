import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "@legacycodehq/dxn-language";
import { afterAll, describe, expect, it } from "vitest";
import {
  createConnection,
  createMessageConnection,
  DidOpenTextDocumentNotification,
  DocumentFormattingRequest,
  InitializeRequest,
  type MessageConnection,
  RenameRequest,
  ShowMessageNotification,
  StreamMessageReader,
  StreamMessageWriter,
  type TextEdit,
} from "vscode-languageserver/node";
import { run } from "../../cli/src/cli.js";
import { diagnose } from "../src/diagnostics.js";
import { evidence } from "../src/evidence.js";
import { serve } from "../src/server.js";

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
  rename?: { line: number; column: number; to: string };
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

const scenarios: Scenario[] = [
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
    capabilities: {},
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
  it.each(scenarios.map((scenario) => [scenario.title, scenario] as const))(
    "find the same problems: %s",
    (_, scenario) => {
      const { root, file } = project(scenario);
      expect(editorProblems(root, file)).toEqual(dxnProblems(root));
    },
  );

  it.each(
    scenarios
      .filter(({ rename }) => rename !== undefined)
      .map((scenario) => [scenario.title, scenario] as const),
  )("refuse and make the same renames: %s", async (_, scenario) => {
    const { root, file } = project(scenario);
    const { line, column, to } = scenario.rename as NonNullable<Scenario["rename"]>;
    // dxn, without writing: refused, or every file it would write.
    const cli = dxn(root, "rename", `spec.dxn:${line}:${column}`, to, "--dry-run", "--json");
    const written =
      cli.code === 0
        ? (JSON.parse(cli.stdout) as { written: Record<string, string> }).written
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
      if (written === undefined) {
        expect([edit, typeof (await refusal)]).toEqual([null, "string"]);
        return;
      }
      const made = Object.fromEntries(
        Object.entries(edit?.changes ?? {}).map(([uri, edits]) => {
          const path = fileURLToPath(uri);
          return [relative(root, path), edited(readFileSync(path, "utf8"), edits)];
        }),
      );
      expect(made).toEqual(written);
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
