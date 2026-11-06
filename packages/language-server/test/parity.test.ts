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
async function connect(text: string) {
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
     "[{"kind":"enumExists","name":"Power","at":{"start":28,"end":33}}]",
   ]
 `);
});
it("gives CLI and server the same diagnostic codes, messages and ranges", async () => {
  const source = "enum Light { on, on }\r\nenum Light { Off }";
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
      code: string;
      message: string;
      span: { start: number; end: number };
    }[];
    const offset = (p: { line: number; character: number }) =>
      source
        .split(/\r\n|\r|\n/)
        .slice(0, p.line)
        .reduce((n, s) => n + s.length + 2, 0) + p.character;
    expect(
      diagnostics.diagnostics.map((d) => ({
        code: d.code,
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
