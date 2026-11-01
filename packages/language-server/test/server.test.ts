import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CompletionItemKind,
  CompletionRequest,
  createConnection,
  createMessageConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidChangeWatchedFilesNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentSymbolRequest,
  FileChangeType,
  HoverRequest,
  InitializeRequest,
  type MessageConnection,
  PrepareRenameRequest,
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
  ReferencesRequest,
  RegistrationRequest,
  RenameRequest,
  SemanticTokensRequest,
  ShowMessageNotification,
  StreamMessageReader,
  StreamMessageWriter,
  SymbolKind,
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

  it("renames a value in the file and in the stored records beside it, in one edit", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-rename-"));
    try {
      const text =
        "enum Hover = rest | hovered\ntype Link {\n  state hover: Hover\n}\nenum Actor = designer\nrecord Evidence with context {\n  actor: Actor\n}\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      mkdirSync(join(folder, "evidence"));
      const stored = `[\n  {\n    "context": { "type": "Link", "profile": null, "dimensions": {}, "states": { "hover": "hovered" } },\n    "actor": "designer"\n  }\n]\n`;
      writeFileSync(join(folder, "evidence", "link.json"), stored);
      const editor = connect();
      editors.push(editor);
      const initialized = await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      expect(initialized.capabilities.renameProvider).toEqual({ prepareProvider: true });
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;

      // "hovered", in its enum.
      const at = { textDocument: { uri }, position: { line: 0, character: 22 } };
      expect(await editor.sendRequest(PrepareRenameRequest.type, at)).toEqual({
        range: { start: { line: 0, character: 20 }, end: { line: 0, character: 27 } },
        placeholder: "hovered",
      });
      const edit = await editor.sendRequest(RenameRequest.type, { ...at, newName: "over" });
      const data = pathToFileURL(join(folder, "evidence", "link.json")).href;
      expect(edit?.changes?.[uri]).toEqual([
        {
          range: { start: { line: 0, character: 20 }, end: { line: 0, character: 27 } },
          newText: "over",
        },
      ]);
      expect(edit?.changes?.[data]).toEqual([
        {
          range: { start: { line: 0, character: 0 }, end: { line: 6, character: 0 } },
          newText: stored.replace('"hover": "hovered"', '"hover": "over"'),
        },
      ]);

      // A refusal is shown as a message, which editors show, where a failed
      // request may only be logged; the request returns nothing to do.
      const shown = (editor: MessageConnection) =>
        new Promise<string>((resolve) => {
          const listening = editor.onNotification(ShowMessageNotification.type, ({ message }) => {
            listening.dispose();
            resolve(message);
          });
        });
      const keyword = shown(editor);
      expect(
        await editor.sendRequest(PrepareRenameRequest.type, {
          textDocument: { uri },
          position: { line: 1, character: 1 },
        }),
      ).toBeNull();
      expect(await keyword).toBe("there is no name here to rename");
      const name = shown(editor);
      expect(await editor.sendRequest(RenameRequest.type, { ...at, newName: "a b" })).toBeNull();
      expect(await name).toBe(
        '"a b" is not a value name: a letter or digit, then letters, digits and hyphens',
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("renames a record and moves its stored records' folder, where the editor can", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-rename-"));
    try {
      const text = "enum Actor = designer\nrecord Evidence with context {\n  actor: Actor\n}\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      mkdirSync(join(folder, "evidence"));
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const at = { textDocument: { uri }, position: { line: 1, character: 9 } };
      const open = async (moves: boolean) => {
        const editor = connect();
        editors.push(editor);
        await editor.sendRequest(InitializeRequest.type, {
          processId: null,
          rootUri: null,
          capabilities: moves
            ? {
                workspace: {
                  workspaceEdit: { documentChanges: true, resourceOperations: ["rename"] },
                },
              }
            : {},
        });
        const opened = published(editor);
        await editor.sendNotification(DidOpenTextDocumentNotification.type, {
          textDocument: { uri, languageId: "dxn", version: 3, text },
        });
        await opened;
        return editor;
      };

      // An editor that can move it: the file's edits, then the folder's move.
      const moving = await open(true);
      expect(await moving.sendRequest(RenameRequest.type, { ...at, newName: "Proof" })).toEqual({
        documentChanges: [
          {
            textDocument: { uri, version: 3 },
            edits: [
              {
                range: { start: { line: 1, character: 7 }, end: { line: 1, character: 15 } },
                newText: "Proof",
              },
            ],
          },
          {
            kind: "rename",
            oldUri: pathToFileURL(join(folder, "evidence")).href,
            newUri: pathToFileURL(join(folder, "proof")).href,
          },
        ],
      });

      // An editor that cannot is told why, and nothing is renamed.
      const still = await open(false);
      const message = new Promise<string>((resolve) => {
        still.onNotification(ShowMessageNotification.type, ({ message: text }) => resolve(text));
      });
      expect(await still.sendRequest(RenameRequest.type, { ...at, newName: "Proof" })).toBeNull();
      expect(await message).toBe(
        "the editor cannot move evidence/, where Evidence's stored records are, to proof/",
      );

      // Nor is a folder moved onto one that is there.
      mkdirSync(join(folder, "proof"));
      const blocked = await open(true);
      const there = new Promise<string>((resolve) => {
        blocked.onNotification(ShowMessageNotification.type, ({ message: text }) => resolve(text));
      });
      expect(await blocked.sendRequest(RenameRequest.type, { ...at, newName: "Proof" })).toBeNull();
      expect(await there).toBe(
        "proof/ is already next to the file; Evidence's stored records cannot move there",
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("outlines a file: its declarations, and what each declares inside it", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.documentSymbolProvider).toBe(true);
    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n}\n",
      },
    });
    await opened;
    const range = (line: number, start: number, end: number) => ({
      start: { line, character: start },
      end: { line, character: end },
    });
    expect(await editor.sendRequest(DocumentSymbolRequest.type, { textDocument: { uri } })).toEqual(
      [
        {
          name: "Focus",
          detail: "enum",
          kind: SymbolKind.Enum,
          range: range(0, 0, 30),
          selectionRange: range(0, 5, 10),
          children: [],
        },
        {
          name: "Button",
          detail: "type",
          kind: SymbolKind.Class,
          range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
          selectionRange: range(1, 5, 11),
          children: [
            {
              name: "focus",
              detail: "state",
              kind: SymbolKind.Field,
              range: range(2, 8, 20),
              selectionRange: range(2, 8, 13),
              children: [],
            },
          ],
        },
      ],
    );
  });

  it("publishes problems with the version they are of, and answers from the latest text", async () => {
    const editor = connect();
    editors.push(editor);
    await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    const uri = "file:///spec/button.dxn";
    const hoverAt = { textDocument: { uri }, position: { line: 2, character: 16 } };
    const text = (values: string) =>
      `enum Focus = ${values}\ntype Button {\n  state focus: Focus\n}\n`;
    const hovered = async () => {
      const found = await editor.sendRequest(HoverRequest.type, hoverAt);
      return (found?.contents as { value: string } | undefined)?.value.split("\n")[1];
    };

    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "dxn", version: 1, text: text("blurred | focused") },
    });
    expect((await opened).version).toBe(1);
    expect(await hovered()).toBe("enum Focus = blurred | focused");

    // An edit: the problems are of its version, and requests see it.
    const changed = published(editor);
    await editor.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: text("blurred | focused | ringed") }],
    });
    expect((await changed).version).toBe(2);
    expect(await hovered()).toBe("enum Focus = blurred | focused | ringed");

    // Closed, and opened again with other text at version 1 again: nothing
    // from before it was closed is kept.
    const closed = published(editor);
    await editor.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } });
    expect(await closed).toEqual({ uri, diagnostics: [] });
    const reopened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "dxn", version: 1, text: text("off | on") },
    });
    await reopened;
    expect(await hovered()).toBe("enum Focus = off | on");
  });

  it("shows the problems in the stored records beside a file, and checks them again as they change", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-evidence-"));
    try {
      const text =
        "enum Actor = designer | reviewer\ntype Card {\n  state owner: Actor\n}\nrecord Evidence with context {\n  actor: Actor\n}\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      mkdirSync(join(folder, "evidence"));
      const record = (actor: string) =>
        `[\n  {\n    "context": { "type": "Card", "dimensions": {}, "states": { "owner": "designer" } },\n    "actor": "${actor}"\n  }\n]\n`;
      const stored = join(folder, "evidence", "card.json");
      writeFileSync(stored, record("maker"));
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const data = pathToFileURL(stored).href;

      const editor = connect();
      editors.push(editor);
      // The server asks to hear of changes to JSON files, where records are.
      const watched = new Promise<unknown>((resolve) => {
        editor.onRequest(RegistrationRequest.type, (params) => {
          resolve(
            params.registrations.map(({ method, registerOptions }) => [method, registerOptions]),
          );
        });
      });
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: { workspace: { didChangeWatchedFiles: { dynamicRegistration: true } } },
      });
      editor.sendNotification("initialized", {});
      expect(await watched).toEqual([
        ["workspace/didChangeWatchedFiles", { watchers: [{ globPattern: "**/*.json" }] }],
      ]);

      // Every notice the server publishes, by the file it is for.
      const notices: PublishDiagnosticsParams[] = [];
      editor.onNotification(PublishDiagnosticsNotification.type, (params) => {
        notices.push(params);
      });
      const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
      const about = (target: string) =>
        notices
          .filter((notice) => notice.uri === target)
          .at(-1)
          ?.diagnostics.map(({ range, code, message, source }) => [
            range.start,
            code,
            message,
            source,
          ]);

      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await settle();
      expect(about(data)).toEqual([
        [
          { line: 3, character: 13 },
          "unknown-value",
          '$[0].actor: "maker" is not a value of Actor (designer, reviewer)',
          "dxn",
        ],
      ]);

      // Fixed on disk, as dxn attach or an edit outside the editor would.
      writeFileSync(stored, record("reviewer"));
      await editor.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [{ uri: data, type: FileChangeType.Changed }],
      });
      await settle();
      expect(about(data)).toEqual([]);

      // Broken again, then the file closed: its records' problems go with it.
      writeFileSync(stored, record("maker"));
      await editor.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [{ uri: data, type: FileChangeType.Changed }],
      });
      await settle();
      expect(about(data)?.length).toBe(1);
      await editor.sendNotification(DidCloseTextDocumentNotification.type, {
        textDocument: { uri },
      });
      await settle();
      expect(about(data)).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("names what each name is, for an editor to colour it by", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    const provider = initialized.capabilities.semanticTokensProvider;
    const legend = provider?.legend ?? { tokenTypes: [], tokenModifiers: [] };
    expect([provider?.full, legend.tokenModifiers]).toEqual([true, ["declaration"]]);
    const uri = "file:///spec/button.dxn";
    const opened = published(editor);
    const text =
      "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n  action focus-in: focus blurred -> focused\n}\n";
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "dxn", version: 1, text },
    });
    await opened;
    const found = await editor.sendRequest(SemanticTokensRequest.type, {
      textDocument: { uri },
    });
    const data = found?.data ?? [];
    // Each token is five numbers, its line and start from the one before.
    const lines = text.split("\n");
    const decoded: string[] = [];
    let line = 0;
    let character = 0;
    for (let at = 0; at < data.length; at += 5) {
      const [deltaLine, deltaStart, length, type, modifiers] = data.slice(at, at + 5) as number[];
      line += deltaLine as number;
      character = deltaLine === 0 ? character + (deltaStart as number) : (deltaStart as number);
      const word = (lines[line] ?? "").slice(character, character + (length as number));
      decoded.push(
        `${word} ${legend.tokenTypes[type as number]}${modifiers === 1 ? " declaration" : ""}`,
      );
    }
    expect(decoded).toEqual([
      "Focus enum declaration",
      "blurred enumMember declaration",
      "focused enumMember declaration",
      "Button class declaration",
      "focus property declaration",
      "Focus enum",
      "focus-in method declaration",
      "focus property",
      "blurred enumMember",
      "focused enumMember",
    ]);
  });
});
