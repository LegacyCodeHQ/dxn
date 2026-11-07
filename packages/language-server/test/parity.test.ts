import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { run } from "@cli/cli.js";
import { serve } from "@language-server/server.js";
import { afterEach, expect, it } from "vitest";
import {
  createConnection,
  createMessageConnection,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentFormattingRequest,
  DocumentSymbolRequest,
  HoverRequest,
  InitializeRequest,
  type MessageConnection,
  PrepareRenameRequest,
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
  RenameRequest,
  SemanticTokensRequest,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver/node";

const editors: MessageConnection[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.dispose();
});
async function connect(text: string, initializationOptions?: object) {
  const toServer = new PassThrough(),
    toEditor = new PassThrough();
  serve(createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toEditor)));
  const editor = createMessageConnection(
    new StreamMessageReader(toEditor),
    new StreamMessageWriter(toServer),
  );
  editor.listen();
  editors.push(editor);
  const initialized = await editor.sendRequest(InitializeRequest.type, {
    processId: null,
    rootUri: null,
    capabilities: {},
    initializationOptions,
  });
  const uri = "file:///new-language.dxn";
  const published = () =>
    new Promise<PublishDiagnosticsParams>((resolve) => {
      const sub = editor.onNotification(PublishDiagnosticsNotification.type, (p) => {
        sub.dispose();
        resolve(p);
      });
    });
  const opened = published();
  await editor.sendNotification(DidOpenTextDocumentNotification.type, {
    textDocument: { uri, languageId: "dxn", version: 1, text },
  });
  return { editor, uri, initialized, diagnostics: await opened, published };
}
it("supports the new syntax and rejects old syntax in unsaved edits", async () => {
  const { editor, uri, diagnostics, published } = await connect("enum Light { off, on }");
  expect(diagnostics.diagnostics).toEqual([]);
  const changed = published();
  await editor.sendNotification(DidChangeTextDocumentNotification.type, {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: "enum Light = off | on" }],
  });
  const update = await changed;
  expect(update.version).toBe(2);
  expect(update.diagnostics.map((d) => d.code)).toEqual(["syntax-error"]);
  expect(update.diagnostics.map((d) => ({ code: d.code, range: d.range }))).toMatchInlineSnapshot(`
   [
     {
       "code": "syntax-error",
       "range": {
         "end": {
           "character": 12,
           "line": 0,
         },
         "start": {
           "character": 11,
           "line": 0,
         },
       },
     },
   ]
 `);
});
it("formats, outlines and hovers without treating keyword values as keywords", async () => {
  const { editor, uri } = await connect("enum Light{off,on}");
  const textDocument = { uri };
  const snapshot: unknown[] = [];
  snapshot.push(
    await editor.sendRequest(HoverRequest.type, {
      textDocument,
      position: { line: 0, character: 15 },
    }),
  );
  snapshot.push(await editor.sendRequest(DocumentSymbolRequest.type, { textDocument }));
  snapshot.push(
    await editor.sendRequest(DocumentFormattingRequest.type, {
      textDocument,
      options: { tabSize: 2, insertSpaces: true },
    }),
  );
  snapshot.push(await editor.sendRequest(SemanticTokensRequest.type, { textDocument }));
  expect(snapshot).toMatchInlineSnapshot(`
   [
     {
       "contents": {
         "kind": "plaintext",
         "value": "Light.on",
       },
       "range": {
         "end": {
           "character": 17,
           "line": 0,
         },
         "start": {
           "character": 15,
           "line": 0,
         },
       },
     },
     [
       {
         "children": [
           {
             "kind": 22,
             "name": "off",
             "range": {
               "end": {
                 "character": 14,
                 "line": 0,
               },
               "start": {
                 "character": 11,
                 "line": 0,
               },
             },
             "selectionRange": {
               "end": {
                 "character": 14,
                 "line": 0,
               },
               "start": {
                 "character": 11,
                 "line": 0,
               },
             },
           },
           {
             "kind": 22,
             "name": "on",
             "range": {
               "end": {
                 "character": 17,
                 "line": 0,
               },
               "start": {
                 "character": 15,
                 "line": 0,
               },
             },
             "selectionRange": {
               "end": {
                 "character": 17,
                 "line": 0,
               },
               "start": {
                 "character": 15,
                 "line": 0,
               },
             },
           },
         ],
         "kind": 10,
         "name": "Light",
         "range": {
           "end": {
             "character": 18,
             "line": 0,
           },
           "start": {
             "character": 0,
             "line": 0,
           },
         },
         "selectionRange": {
           "end": {
             "character": 10,
             "line": 0,
           },
           "start": {
             "character": 5,
             "line": 0,
           },
         },
       },
     ],
     [
       {
         "newText": "enum Light { off, on }
   ",
         "range": {
           "end": {
             "character": 18,
             "line": 0,
           },
           "start": {
             "character": 0,
             "line": 0,
           },
         },
       },
     ],
     {
       "data": [
         0,
         5,
         5,
         0,
         1,
         0,
         6,
         3,
         1,
         1,
         0,
         4,
         2,
         1,
         1,
       ],
     },
   ]
 `);
});
it("renames unsaved buffers with precise edits and refuses value rename and collisions", async () => {
  const { editor, uri } = await connect("enum Light { off, on }\nenum Power { off }\n");
  const textDocument = { uri };
  const snapshot: unknown[] = [];
  snapshot.push(
    await editor.sendRequest(PrepareRenameRequest.type, {
      textDocument,
      position: { line: 0, character: 6 },
    }),
  );
  snapshot.push(
    await editor.sendRequest(RenameRequest.type, {
      textDocument,
      position: { line: 0, character: 6 },
      newName: "Lamp",
    }),
  );
  snapshot.push(
    await editor.sendRequest(PrepareRenameRequest.type, {
      textDocument,
      position: { line: 0, character: 14 },
    }),
  );
  try {
    await editor.sendRequest(RenameRequest.type, {
      textDocument,
      position: { line: 0, character: 6 },
      newName: "Power",
    });
  } catch (e) {
    snapshot.push((e as Error).message);
    expect((e as { data?: unknown }).data).toMatchObject({ refusals: [{ rule: "RE4" }] });
  }
  expect(snapshot).toMatchInlineSnapshot(`
    [
      {
        "placeholder": "Light",
        "range": {
          "end": {
            "character": 10,
            "line": 0,
          },
          "start": {
            "character": 5,
            "line": 0,
          },
        },
      },
      {
        "documentChanges": [
          {
            "edits": [
              {
                "newText": "Lamp",
                "range": {
                  "end": {
                    "character": 10,
                    "line": 0,
                  },
                  "start": {
                    "character": 5,
                    "line": 0,
                  },
                },
              },
            ],
            "textDocument": {
              "uri": "file:///new-language.dxn",
              "version": 1,
            },
          },
        ],
      },
      null,
      "[{"kind":"nameExists","rule":"RE4","name":"Power","at":{"start":28,"end":33}}]",
    ]
  `);
});
it("gives CLI and server the same diagnostic codes, messages and ranges", async () => {
  const source = "enum light { }\r\nenum Light { on, on }\r\nenum Light { Off }";
  const { diagnostics } = await connect(source);
  const folder = mkdtempSync(join(tmpdir(), "dxn-parity-"));
  try {
    writeFileSync(join(folder, "a.dxn"), source);
    let stdout = "";
    expect(
      run(["check", "a.dxn", "--json"], {
        cwd: folder,
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      }),
    ).toBe(1);
    const problems = JSON.parse(stdout).problems as {
      rule: string;
      suggestion?: string;
      code: string;
      message: string;
      span: { start: number; end: number };
    }[];
    expect([...new Set(problems.map((p) => p.rule))].sort()).toEqual([
      "E1",
      "E2",
      "E3",
      "E4",
      "F1",
    ]);
    expect(problems.find((p) => p.code === "badValueName")?.suggestion).toBe("off");
    const offset = (p: { line: number; character: number }) =>
      source
        .split(/\r\n|\r|\n/)
        .slice(0, p.line)
        .reduce((n, s) => n + s.length + 2, 0) + p.character;
    expect(
      diagnostics.diagnostics.map((d) => ({
        code: d.code,
        ...(d.data?.rule ? { rule: d.data.rule } : {}),
        ...(d.data?.suggestion ? { suggestion: d.data.suggestion } : {}),
        message: d.message,
        span: { start: offset(d.range.start), end: offset(d.range.end) },
      })),
    ).toEqual(problems);
    expect(readFileSync(join(folder, "a.dxn"), "utf8")).toBe(source);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("navigates only declarations, offers the supported check command and clears closed files", async () => {
  const { editor, uri, initialized, published } = await connect("enum Light { off, on }");
  const {
    DefinitionRequest,
    ReferencesRequest,
    CodeLensRequest,
    DidCloseTextDocumentNotification,
  } = await import("vscode-languageserver/node");
  const textDocument = { uri };
  const at = { textDocument, position: { line: 0, character: 6 } };
  expect(initialized.capabilities).not.toHaveProperty("inlayHintProvider");
  const snapshot: unknown[] = [];
  snapshot.push(await editor.sendRequest(DefinitionRequest.type, at));
  snapshot.push(
    await editor.sendRequest(ReferencesRequest.type, {
      ...at,
      context: { includeDeclaration: true },
    }),
  );
  snapshot.push(
    await editor.sendRequest(ReferencesRequest.type, {
      ...at,
      context: { includeDeclaration: false },
    }),
  );
  snapshot.push(await editor.sendRequest(CodeLensRequest.type, { textDocument }));
  const closed = published();
  await editor.sendNotification(DidCloseTextDocumentNotification.type, { textDocument });
  snapshot.push((await closed).diagnostics);
  snapshot.push(await editor.sendRequest(HoverRequest.type, at));
  expect(snapshot).toMatchInlineSnapshot(`
    [
      {
        "range": {
          "end": {
            "character": 10,
            "line": 0,
          },
          "start": {
            "character": 5,
            "line": 0,
          },
        },
        "uri": "file:///new-language.dxn",
      },
      [
        {
          "range": {
            "end": {
              "character": 10,
              "line": 0,
            },
            "start": {
              "character": 5,
              "line": 0,
            },
          },
          "uri": "file:///new-language.dxn",
        },
      ],
      [],
      [
        {
          "command": {
            "arguments": [
              "file:///new-language.dxn",
              [
                "check",
              ],
            ],
            "command": "dxn.run",
            "title": "Check",
          },
          "range": {
            "end": {
              "character": 10,
              "line": 0,
            },
            "start": {
              "character": 5,
              "line": 0,
            },
          },
        },
      ],
      [],
      null,
    ]
  `);
});

it("refuses malformed formatting and clears errors after an incremental unsaved repair", async () => {
  const { editor, uri, diagnostics, published } = await connect("enum Light { off, }");
  expect(diagnostics.diagnostics.map((d) => d.code)).toEqual(["syntax-error"]);
  const textDocument = { uri };
  expect(
    await editor.sendRequest(DocumentFormattingRequest.type, {
      textDocument,
      options: { tabSize: 2, insertSpaces: true },
    }),
  ).toEqual([]);
  const repaired = published();
  await editor.sendNotification(DidChangeTextDocumentNotification.type, {
    textDocument: { uri, version: 2 },
    contentChanges: [
      { range: { start: { line: 0, character: 16 }, end: { line: 0, character: 17 } }, text: "" },
    ],
  });
  expect((await repaired).diagnostics).toEqual([]);
  const renamed = await editor.sendRequest(RenameRequest.type, {
    textDocument,
    position: { line: 0, character: 6 },
    newName: "Light",
  });
  expect(renamed?.documentChanges).toEqual([{ textDocument: { uri, version: 2 }, edits: [] }]);
});

it("uses the same formatter and rename transformation as the CLI", async () => {
  const source = "enum Light{off,on}\n";
  const { editor, uri } = await connect(source);
  const textDocument = { uri };
  const folder = mkdtempSync(join(tmpdir(), "dxn-parity-"));
  try {
    const file = join(folder, "a.dxn");
    writeFileSync(file, source);
    const cli = (args: string[]) => {
      let stdout = "";
      const code = run(args, {
        cwd: folder,
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      });
      expect(code).toBe(0);
      return stdout;
    };
    const formatEdits = await editor.sendRequest(DocumentFormattingRequest.type, {
      textDocument,
      options: { tabSize: 4, insertSpaces: false },
    });
    expect(formatEdits?.map((e) => e.newText)).toEqual([cli(["fmt", "a.dxn"])]);
    const rename = await editor.sendRequest(RenameRequest.type, {
      textDocument,
      position: { line: 0, character: 6 },
      newName: "Lamp",
    });
    const changed = rename?.documentChanges?.[0];
    if (!changed || !("edits" in changed)) throw new Error("expected a text edit");
    const edits = changed.edits;
    const edit = edits[0];
    if (!edit || !("newText" in edit)) throw new Error("expected plain rename edit");
    const transformed =
      source.slice(0, edit.range.start.character) +
      edit.newText +
      source.slice(edit.range.end.character);
    const preview = JSON.parse(cli(["rename", "a.dxn", "Light", "Lamp", "--dry-run", "--json"]));
    expect(transformed).toBe(preview.source);
    expect(readFileSync(file, "utf8")).toBe(source);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("offers a versioned naming correction from the current unsaved text, not client-supplied suggestions", async () => {
  const { CodeActionRequest } = await import("vscode-languageserver/node");
  const { editor, uri, initialized, diagnostics, published } = await connect(
    "enum Light { noKeyboard }",
  );
  expect(initialized.capabilities.codeActionProvider).toBeTruthy();
  const changed = published();
  await editor.sendNotification(DidChangeTextDocumentNotification.type, {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: "enum Light { Off }" }],
  });
  const current = await changed;
  const actions = await editor.sendRequest(CodeActionRequest.type, {
    textDocument: { uri },
    range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
    context: {
      diagnostics: diagnostics.diagnostics.map((d) => ({
        ...d,
        data: { rule: "E3", suggestion: "malicious" },
      })),
    },
  });
  expect(actions).toHaveLength(1);
  const action = actions?.[0];
  if (!action || !("edit" in action)) throw new Error("expected code action");
  expect(action).toMatchObject({
    title: "Replace 'Off' with 'off'",
    kind: "quickfix",
    diagnostics: current.diagnostics,
    edit: {
      documentChanges: [
        {
          textDocument: { uri, version: 2 },
          edits: [
            {
              range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
              newText: "off",
            },
          ],
        },
      ],
    },
  });
  expect(
    await editor.sendRequest(CodeActionRequest.type, {
      textDocument: { uri },
      range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
      context: { diagnostics: [], only: ["refactor"] },
    }),
  ).toEqual([]);
});

it("removes naming actions after an unsaved collision or syntax error appears", async () => {
  const { CodeActionRequest } = await import("vscode-languageserver/node");
  const { editor, uri, published } = await connect("enum Light { Off }");
  const request = {
    textDocument: { uri },
    range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
    context: { diagnostics: [] },
  };
  expect(await editor.sendRequest(CodeActionRequest.type, request)).toHaveLength(1);
  for (const [version, text] of [
    [2, "enum Light { Off, off }"],
    [3, "enum Light { Off } enum Broken {"],
  ] as const) {
    const changed = published();
    await editor.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
    await changed;
    expect(await editor.sendRequest(CodeActionRequest.type, request)).toEqual([]);
  }
  expect(
    await editor.sendRequest(CodeActionRequest.type, {
      ...request,
      textDocument: { uri: "file:///not-open.dxn" },
    }),
  ).toEqual([]);
});

it("navigates and renames enumeration references in an unsaved type and matches the CLI", async () => {
  const { DefinitionRequest, ReferencesRequest } = await import("vscode-languageserver/node");
  const source = "type Button { varies Kind }\nenum Kind { primary, secondary }\n";
  const { editor, uri, diagnostics } = await connect(source);
  expect(diagnostics.diagnostics).toEqual([]);
  const textDocument = { uri },
    position = { line: 0, character: 22 };
  const definition = { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } };
  expect(await editor.sendRequest(DefinitionRequest.type, { textDocument, position })).toEqual({
    uri,
    range: definition,
  });
  expect(
    await editor.sendRequest(ReferencesRequest.type, {
      textDocument,
      position,
      context: { includeDeclaration: false },
    }),
  ).toEqual([
    { uri, range: { start: { line: 0, character: 21 }, end: { line: 0, character: 25 } } },
  ]);
  const renamed = await editor.sendRequest(RenameRequest.type, {
    textDocument,
    position,
    newName: "Role",
  });
  const change = renamed?.documentChanges?.[0];
  if (!change || !("edits" in change)) throw new Error("expected edits");
  expect(change.textDocument).toEqual({ uri, version: 1 });
  expect(change.edits).toHaveLength(2);
  const folder = mkdtempSync(join(tmpdir(), "dxn-type-parity-"));
  try {
    writeFileSync(join(folder, "a.dxn"), source);
    let output = "";
    expect(
      run(["rename", "a.dxn", "Kind", "Role", "--json", "--dry-run"], {
        cwd: folder,
        stdout: (s) => {
          output += s;
        },
        stderr: () => {},
      }),
    ).toBe(0);
    const { TextDocument } = await import("vscode-languageserver-textdocument");
    const edits = change.edits.map((edit) => {
      if (!("newText" in edit)) throw new Error("expected text edit");
      return edit;
    });
    expect(TextDocument.applyEdits(TextDocument.create(uri, "dxn", 1, source), edits)).toBe(
      JSON.parse(output).source,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("reports T1–T3 and cross-kind F1 identically in CLI JSON and current editor diagnostics", async () => {
  const source = "enum Kind { primary } type button { varies Missing, Missing } type Kind {}";
  const { diagnostics } = await connect(source);
  expect(diagnostics.diagnostics.map((d) => d.data?.rule)).toEqual([
    "T1",
    "T2",
    "T2",
    "T3",
    "T3",
    "F1",
    "F1",
  ]);
  const folder = mkdtempSync(join(tmpdir(), "dxn-type-diagnostics-"));
  try {
    writeFileSync(join(folder, "a.dxn"), source);
    let output = "";
    expect(
      run(["check", "a.dxn", "--json"], {
        cwd: folder,
        stdout: (s) => {
          output += s;
        },
        stderr: () => {},
      }),
    ).toBe(1);
    expect(
      JSON.parse(output).problems.map((p: { rule: string; message: string }) => [
        p.rule,
        p.message,
      ]),
    ).toEqual(diagnostics.diagnostics.map((d) => [d.data?.rule, d.message]));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("shows exact counts, opens the shared table, and rechecks unsaved buffers on activation", async () => {
  const { CodeLensRequest, ExecuteCommandRequest, ShowMessageNotification } = await import(
    "vscode-languageserver/node"
  );
  const { editor, uri, published } = await connect(
    "type Logo {} enum Light { off, on } type Lamp { varies Light }",
  );
  const lenses = await editor.sendRequest(CodeLensRequest.type, { textDocument: { uri } });
  const counts = lenses?.filter((l) => l.command?.command === "dxn.combinations") ?? [];
  expect(counts.map((l) => l.command?.title)).toEqual(["1 combination", "2 combinations"]);
  const command = counts[1]?.command;
  if (!command) throw new Error("expected combination lens");
  const shown = new Promise<string>((resolve) =>
    editor.onNotification(ShowMessageNotification.type, (p) => resolve(p.message)),
  );
  const result = await editor.sendRequest(ExecuteCommandRequest.type, {
    command: command.command,
    arguments: command.arguments,
  });
  expect(await shown).toBe((result as { table: string }).table);
  expect(result).toMatchObject({
    types: [{ type: "Lamp", count: 2, combinations: [{ Light: "off" }, { Light: "on" }] }],
  });
  const changed = published();
  await editor.sendNotification(DidChangeTextDocumentNotification.type, {
    textDocument: { uri, version: 2 },
    contentChanges: [{ text: "type Lamp { varies Missing }" }],
  });
  await changed;
  expect(
    (await editor.sendRequest(CodeLensRequest.type, { textDocument: { uri } }))?.some(
      (l) => l.command?.command === "dxn.combinations",
    ),
  ).toBe(false);
  await expect(
    editor.sendRequest(ExecuteCommandRequest.type, {
      command: command.command,
      arguments: command.arguments,
    }),
  ).rejects.toThrow();
});

it("explains when a varies reference names a type, without changing T2", async () => {
  const { diagnostics } = await connect("type Button {} type Menu { varies Button }");
  expect(diagnostics.diagnostics[0]).toMatchObject({
    code: "noSuchEnum",
    data: { rule: "T2" },
    message: "[T2] 'Button' is a type, not an enumeration; a type varies over enumerations only",
  });
});

it("returns the same table and JSON as the CLI to a table-capable editor without an extra message", async () => {
  const { CodeLensRequest, ExecuteCommandRequest, ShowMessageNotification } = await import(
    "vscode-languageserver/node"
  );
  const source = "enum Light { off, on } type Lamp { varies Light }";
  const { editor, uri, published } = await connect(source, { combinationTables: true });
  const messages: unknown[] = [];
  editor.onNotification(ShowMessageNotification.type, (p) => {
    messages.push(p);
  });
  const folder = mkdtempSync(join(tmpdir(), "dxn-table-parity-"));
  try {
    writeFileSync(join(folder, "a.dxn"), source);
    const cli = (args: string[]) => {
      let output = "";
      expect(
        run(args, {
          cwd: folder,
          stdout: (s) => {
            output += s;
          },
          stderr: () => {},
        }),
      ).toBe(0);
      return output;
    };
    const result = (await editor.sendRequest(ExecuteCommandRequest.type, {
      command: "dxn.combinations",
      arguments: [uri, "Lamp"],
    })) as { table: string; types: unknown[] };
    expect(`${result.table}\n`).toBe(cli(["combinations", "a.dxn", "Lamp"]));
    expect(result.types).toEqual(
      JSON.parse(cli(["combinations", "a.dxn", "Lamp", "--json"])).types,
    );
    const changed = published();
    await editor.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: "type Lamp {}" }],
    });
    await changed;
    expect(
      await editor.sendRequest(ExecuteCommandRequest.type, {
        command: "dxn.combinations",
        arguments: [uri, "Lamp"],
      }),
    ).toMatchObject({ table: "Lamp: 1 combination (varies over nothing)" });
    expect(
      (await editor.sendRequest(CodeLensRequest.type, { textDocument: { uri } }))?.map(
        (l) => l.command?.title,
      ),
    ).toEqual(["Check", "1 combination"]);
    expect(messages).toEqual([]);
    for (const args of [[uri, "Missing"], ["file:///closed.dxn", "Lamp"], [uri], [uri, 42]]) {
      await expect(
        editor.sendRequest(ExecuteCommandRequest.type, {
          command: "dxn.combinations",
          arguments: args,
        }),
      ).rejects.toThrow();
    }
    await expect(
      editor.sendRequest(ExecuteCommandRequest.type, {
        command: "unknown",
        arguments: [uri, "Lamp"],
      }),
    ).rejects.toThrow();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("navigates and renames a record reference using the same transformation as the CLI", async () => {
  const { DefinitionRequest } = await import("vscode-languageserver/node");
  const source =
    "record Review { finding: Finding }\nrecord Finding { verdict: Verdict }\nenum Verdict { approved, changes }\ntype Button { varies Verdict }\n";
  const { editor, uri, diagnostics } = await connect(source);
  expect(diagnostics.diagnostics).toEqual([]);
  const textDocument = { uri },
    position = { line: 0, character: 26 };
  expect(await editor.sendRequest(DefinitionRequest.type, { textDocument, position })).toEqual({
    uri,
    range: { start: { line: 1, character: 7 }, end: { line: 1, character: 14 } },
  });
  const renamed = await editor.sendRequest(RenameRequest.type, {
    textDocument,
    position,
    newName: "Issue",
  });
  const change = renamed?.documentChanges?.[0];
  if (!change || !("edits" in change)) throw new Error("expected text changes");
  const { TextDocument } = await import("vscode-languageserver-textdocument");
  const edits = change.edits.map((e) => {
    if (!("newText" in e)) throw new Error("expected plain edit");
    return e;
  });
  const applied = TextDocument.applyEdits(TextDocument.create(uri, "dxn", 1, source), edits);
  const folder = mkdtempSync(join(tmpdir(), "dxn-record-parity-"));
  try {
    writeFileSync(join(folder, "a.dxn"), source);
    let stdout = "";
    expect(
      run(["rename", "a.dxn", "Finding", "Issue", "--dry-run", "--json"], {
        cwd: folder,
        stdout: (s) => {
          stdout += s;
        },
        stderr: () => {},
      }),
    ).toBe(0);
    expect(applied).toBe(JSON.parse(stdout).source);
    expect(applied).toBe(source.replaceAll("Finding", "Issue"));
    expect(
      await editor.sendRequest(PrepareRenameRequest.type, {
        textDocument,
        position: { line: 3, character: 6 },
      }),
    ).toBeTruthy();
    expect(
      await editor.sendRequest(PrepareRenameRequest.type, {
        textDocument,
        position: { line: 0, character: 18 },
      }),
    ).toBeNull();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("reports contextual R5 and R6 through the shared CLI/LSP contract", async () => {
  const source = "type Button {} record Review { button: Button\nreply: Review }";
  const { diagnostics } = await connect(source);
  const folder = mkdtempSync(join(tmpdir(), "dxn-record-diagnostics-"));
  try {
    writeFileSync(join(folder, "a.dxn"), source);
    let output = "";
    expect(
      run(["check", "a.dxn", "--json"], {
        cwd: folder,
        stdout: (text) => {
          output += text;
        },
        stderr: () => {},
      }),
    ).toBe(1);
    expect(
      JSON.parse(output).problems.map((p: { code: string; rule: string; message: string }) => [
        p.code,
        p.rule,
        p.message,
      ]),
    ).toEqual(diagnostics.diagnostics.map((d) => [d.code, d.data?.rule, d.message]));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  expect(diagnostics.diagnostics.map((d) => [d.data?.rule, d.message])).toMatchInlineSnapshot(`
    [
      [
        "R5",
        "[R5] 'Button' is a type; a field's type is an enumeration or a record",
      ],
      [
        "R6",
        "[R6] record 'Review' contains itself: Review -> Review; remove a field that leads back",
      ],
    ]
  `);
});
