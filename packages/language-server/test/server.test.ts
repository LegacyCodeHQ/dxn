import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  createConnection,
  createMessageConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  InitializeRequest,
  type MessageConnection,
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
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
});
