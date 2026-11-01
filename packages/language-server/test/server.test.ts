import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  CompletionItemKind,
  CompletionRequest,
  createConnection,
  createMessageConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  HoverRequest,
  InitializeRequest,
  type MessageConnection,
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
  ReferencesRequest,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver/node";
import { serve } from "../src/server.js";

// A server and an editor talking over a pair of streams, as they would over
// the server's standard input and output.
function connect(): MessageConnection {
  const toServer = new PassThrough();
  const toEditor = new PassThrough();
  serve(createConnection(new StreamMessageReader(toServer), new StreamMessageWriter(toEditor)));
  const editor = createMessageConnection(
    new StreamMessageReader(toEditor),
    new StreamMessageWriter(toServer),
  );
  editor.listen();
  return editor;
}

const editors: MessageConnection[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.dispose();
});

// The next problems the server publishes.
const published = (editor: MessageConnection) =>
  new Promise<PublishDiagnosticsParams>((resolve) => {
    const listening = editor.onNotification(PublishDiagnosticsNotification.type, (params) => {
      listening.dispose();
      resolve(params);
    });
  });

describe("the language server", () => {
  it("publishes a file's problems when it is opened, and again when it changes", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.textDocumentSync).toEqual(expect.anything());

    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "enum Enabled = enabled | disabled\ntype Button {\n  state enabled: Enabld\n}\n",
      },
    });
    const first = await opened;
    expect([first.uri, first.diagnostics.map(({ code }) => code)]).toEqual([uri, ["unknown-enum"]]);

    const changed = published(editor);
    await editor.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version: 2 },
      contentChanges: [
        {
          text: "enum Enabled = enabled | disabled\ntype Button {\n  state enabled: Enabled\n}\n",
        },
      ],
    });
    expect((await changed).diagnostics).toEqual([]);
  });

  it("goes from a name to where the file declares it", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.definitionProvider).toBe(true);

    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "enum Enabled = enabled | disabled\ntype Button {\n  state enabled: Enabled\n}\n",
      },
    });
    await opened;
    // From "Enabled" in the state, to its enum: lines and characters from zero.
    expect(
      await editor.sendRequest(DefinitionRequest.type, {
        textDocument: { uri },
        position: { line: 2, character: 19 },
      }),
    ).toEqual({
      uri,
      range: { start: { line: 0, character: 5 }, end: { line: 0, character: 12 } },
    });
    expect(
      await editor.sendRequest(DefinitionRequest.type, {
        textDocument: { uri },
        position: { line: 2, character: 2 },
      }),
    ).toBeNull();
  });

  it("names the whole name it goes from, to an editor that can underline it", async () => {
    const editor = connect();
    editors.push(editor);
    await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: { textDocument: { definition: { linkSupport: true } } },
    });
    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n  action take-focus: focus blurred -> focused\n  event press\n  on press: take-focus\n}\n",
      },
    });
    await opened;
    // From "take-focus" in the trigger, hyphen and all, to the action.
    expect(
      await editor.sendRequest(DefinitionRequest.type, {
        textDocument: { uri },
        position: { line: 5, character: 13 },
      }),
    ).toEqual([
      {
        originSelectionRange: {
          start: { line: 5, character: 12 },
          end: { line: 5, character: 22 },
        },
        targetUri: uri,
        targetRange: { start: { line: 3, character: 9 }, end: { line: 3, character: 19 } },
        targetSelectionRange: { start: { line: 3, character: 9 }, end: { line: 3, character: 19 } },
      },
    ]);
  });

  it("finds where a name is used, with its declaration when the editor asks", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.referencesProvider).toBe(true);
    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n  action take-focus: focus blurred -> focused\n  event press\n  on press: take-focus\n}\n",
      },
    });
    await opened;
    const range = (line: number, start: number, end: number) => ({
      uri,
      range: { start: { line, character: start }, end: { line, character: end } },
    });
    // From the action's declaration: where it is used, and the declaration too
    // when the editor asks for it.
    const at = { textDocument: { uri }, position: { line: 3, character: 12 } };
    expect(
      await editor.sendRequest(ReferencesRequest.type, {
        ...at,
        context: { includeDeclaration: false },
      }),
    ).toEqual([range(5, 12, 22)]);
    expect(
      await editor.sendRequest(ReferencesRequest.type, {
        ...at,
        context: { includeDeclaration: true },
      }),
    ).toEqual([range(3, 9, 19), range(5, 12, 22)]);
  });

  it("suggests what fits where the cursor is, each with its kind", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.completionProvider?.triggerCharacters).toEqual(["."]);
    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n  state ring: \n  focus = \n}\n",
      },
    });
    await opened;
    const at = (line: number, character: number) =>
      editor.sendRequest(CompletionRequest.type, {
        textDocument: { uri },
        position: { line, character },
      });
    expect(await at(3, 14)).toEqual([
      { label: "Focus", kind: CompletionItemKind.Enum, detail: "enum" },
    ]);
    expect(await at(4, 10)).toEqual([
      { label: "blurred", kind: CompletionItemKind.EnumMember, detail: "value" },
      { label: "focused", kind: CompletionItemKind.EnumMember, detail: "value" },
    ]);
  });

  it("shows what a name is, as dxn, with the comment above its declaration", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.hoverProvider).toBe(true);
    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "# Whether it has the focus.\nenum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n}\n",
      },
    });
    await opened;
    expect(
      await editor.sendRequest(HoverRequest.type, {
        textDocument: { uri },
        position: { line: 3, character: 16 },
      }),
    ).toEqual({
      contents: {
        kind: "markdown",
        value: "```dxn\nenum Focus = blurred | focused\n```\n\nWhether it has the focus.",
      },
      range: { start: { line: 3, character: 15 }, end: { line: 3, character: 20 } },
    });
    expect(
      await editor.sendRequest(HoverRequest.type, {
        textDocument: { uri },
        position: { line: 3, character: 3 },
      }),
    ).toBeNull();
  });
});
