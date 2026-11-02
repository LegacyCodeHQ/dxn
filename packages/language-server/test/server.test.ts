import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { Fingerprints } from "@legacycodehq/dxn-language";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodeLensRequest,
  CompletionItemKind,
  CompletionRequest,
  createConnection,
  createMessageConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidChangeWatchedFilesNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentFormattingRequest,
  DocumentSymbolRequest,
  FileChangeType,
  HoverRequest,
  InitializeRequest,
  InlayHintRefreshRequest,
  InlayHintRequest,
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
        "enum Hover = rest | hovered\ntype Link {\n  state hover: Hover\n}\nenum Actor = designer\nrecord Evidence {\n}\nactor Designer records Evidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      mkdirSync(join(folder, "evidence"));
      const stored = `[\n  {\n    "context": { "type": "Link", "profile": null, "dimensions": {}, "states": { "hover": "hovered" } },\n    "actor": "Designer"\n  }\n]\n`;
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
        "`a b` is not a value name: lowercase letters and digits, with single hyphens between them",
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("renames a record and moves its stored records' folder, where the editor can", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-rename-"));
    try {
      const text = "enum Actor = designer\nrecord Evidence {\n}\nactor Designer records Evidence\n";
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
              {
                range: { start: { line: 3, character: 23 }, end: { line: 3, character: 31 } },
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
        "the editor cannot move evidence/, where `Evidence`'s stored records are, to proof/",
      );

      // Nor is a folder moved onto one that is there.
      mkdirSync(join(folder, "proof"));
      const blocked = await open(true);
      const there = new Promise<string>((resolve) => {
        blocked.onNotification(ShowMessageNotification.type, ({ message: text }) => resolve(text));
      });
      expect(await blocked.sendRequest(RenameRequest.type, { ...at, newName: "Proof" })).toBeNull();
      expect(await there).toBe(
        "proof/ is already next to the file; `Evidence`'s stored records cannot move there",
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
        text: "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n}\nrecord Evidence {\n}\nactor Designer records Evidence\n",
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
        {
          name: "Evidence",
          detail: "record",
          kind: SymbolKind.Struct,
          range: { start: { line: 4, character: 0 }, end: { line: 5, character: 1 } },
          selectionRange: range(4, 7, 15),
          children: [],
        },
        {
          name: "Designer",
          detail: "actor",
          kind: SymbolKind.Interface,
          range: range(6, 0, 31),
          selectionRange: range(6, 6, 14),
          children: [],
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
        "enum Actor = designer | reviewer\ntype Card {\n  state owner: Actor\n}\nrecord Evidence {\n}\nactor Designer records Evidence\nactor Reviewer records Evidence\n";
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
        [
          "workspace/didChangeWatchedFiles",
          { watchers: [{ globPattern: "**/*.json" }, { globPattern: "**/*.pen" }] },
        ],
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
          "unknown-actor",
          "$[0].actor: `maker` is not an actor who records `Evidence` (`Designer`, `Reviewer`)",
          "dxn",
        ],
      ]);

      // Fixed on disk, as dxn attach or an edit outside the editor would.
      writeFileSync(stored, record("Reviewer"));
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
      "enum Focus = blurred | focused\ntype Button {\n  state focus: Focus\n  action focus-in: focus blurred -> focused\n}\nrecord Evidence {\n}\nactor Designer records Evidence\nenvironment Device = Focus\nprofile Desk: Device { Focus = blurred }\nmodifier Pad on Desk { Focus = focused }\n";
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
      "Evidence struct declaration",
      "Designer class declaration",
      "Evidence struct",
      "Device namespace declaration",
      "Focus enum",
      "Desk class declaration",
      "Device namespace",
      "Focus enum",
      "blurred enumMember",
      "Pad class declaration",
      "Desk class",
      "Focus enum",
      "focused enumMember",
    ]);
  });

  it("offers to run each type's states and each expectation, as code lenses", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.codeLensProvider).toEqual({ resolveProvider: false });
    const uri = "file:///spec/menu.dxn";
    const opened = published(editor);
    await editor.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "dxn",
        version: 1,
        text: 'enum State = closed | open\ntype Menu {\n  state menu: State\n  type Toggle {\n    state expanded: State\n  }\n  has toggle: Toggle\n}\nexpect "The menu can be open" {\n  in Menu\n  some menu = open\n}\n',
      },
    });
    await opened;
    const lenses = await editor.sendRequest(CodeLensRequest.type, { textDocument: { uri } });
    expect(
      lenses?.map(({ range, command }) => [
        range.start.line,
        command?.title,
        command?.command,
        command?.arguments,
      ]),
    ).toEqual([
      [1, "Run states", "dxn.run", [uri, ["states", "Menu"]]],
      [3, "Run states", "dxn.run", [uri, ["states", "Menu.Toggle"]]],
      [8, "Run", "dxn.run", [uri, ["check", "--expect", "The menu can be open"]]],
    ]);
  });

  it("shows a stored record that repeats another, across the record's files", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-duplicates-"));
    try {
      const text =
        "enum Actor = designer | reviewer\ntype Card {\n  state owner: Actor\n}\nrecord Evidence {\n  source: PenNode\n}\nactor Designer records Evidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      mkdirSync(join(folder, "evidence"));
      // The same record, its node fingerprinted at two times.
      const entry = (fingerprint: string) =>
        `  {\n    "context": { "type": "Card", "dimensions": {}, "states": { "owner": "designer" } },\n    "actor": "Designer",\n    "source": { "file": "a.pen", "frame": "f", "fingerprint": "${fingerprint}" }\n  }`;
      writeFileSync(join(folder, "evidence", "a.json"), `[\n${entry("one")}\n]\n`);
      writeFileSync(join(folder, "evidence", "b.json"), `[\n${entry("two")}\n]\n`);
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const first = pathToFileURL(join(folder, "evidence", "a.json")).href;
      const second = pathToFileURL(join(folder, "evidence", "b.json")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const notices: PublishDiagnosticsParams[] = [];
      editor.onNotification(PublishDiagnosticsNotification.type, (params) => {
        notices.push(params);
      });
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const about = (target: string) =>
        notices
          .filter((notice) => notice.uri === target)
          .at(-1)
          ?.diagnostics.map(({ range, code, message }) => [range.start, code, message]);
      expect([about(first), about(second)]).toEqual([
        [],
        [
          [
            { line: 1, character: 2 },
            "duplicate-record",
            "$[0]: the same `Evidence` as $[0] in evidence/a.json, apart from their fingerprints",
          ],
        ],
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("formats a file the one way, as dxn fmt does, in one edit, and leaves one that does not parse", async () => {
    const editor = connect();
    editors.push(editor);
    const initialized = await editor.sendRequest(InitializeRequest.type, {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    expect(initialized.capabilities.documentFormattingProvider).toBe(true);
    const open = async (uri: string, text: string) => {
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      return editor.sendRequest(DocumentFormattingRequest.type, {
        textDocument: { uri },
        options: { tabSize: 4, insertSpaces: false },
      });
    };
    expect(
      await open(
        "file:///messy.dxn",
        "enum   Hover=rest|hovered\ntype Link {\nstate hover: Hover\n}",
      ),
    ).toEqual([
      {
        range: { start: { line: 0, character: 0 }, end: { line: 3, character: 1 } },
        newText: "enum Hover = rest | hovered\ntype Link {\n  state hover: Hover\n}\n",
      },
    ]);
    expect(await open("file:///tidy.dxn", "enum Hover = rest | hovered\n")).toEqual([]);
    expect(await open("file:///broken.dxn", "enum Hover = rest hovered\n")).toEqual([]);
  });
  it("shows after each element of the trees how much of it has evidence, and in its hover what is left", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-progress-"));
    try {
      const text =
        "enum Style = filled | plain\ntype Button {\n  state style: Style\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      // A drawing, and evidence of the filled button with its fingerprint now.
      const drawing = join(folder, "design.txt");
      writeFileSync(drawing, "filled\n");
      const blob = (content: string) =>
        createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
      mkdirSync(join(folder, "pen-evidence"));
      writeFileSync(
        join(folder, "pen-evidence", "button.json"),
        JSON.stringify([
          {
            context: { type: "Button", dimensions: {}, states: { style: "filled" } },
            actor: "DesignAgent",
            source: { file: "design.txt", frame: "f", fingerprint: blob("filled\n") },
          },
        ]),
      );
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      const refreshed: unknown[] = [];
      editor.onRequest(InlayHintRefreshRequest.method, () => {
        refreshed.push(true);
        return null;
      });
      const initialized = await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: { workspace: { inlayHint: { refreshSupport: true } } },
      });
      expect(initialized.capabilities.inlayHintProvider).toBe(true);
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      const hints = async () =>
        (
          await editor.sendRequest(InlayHintRequest.type, {
            textDocument: { uri },
            range: { start: { line: 0, character: 0 }, end: { line: 8, character: 0 } },
          })
        )?.map(({ position, label, paddingLeft }) => [position, label, paddingLeft]);
      const hovered = async () => {
        const found = await editor.sendRequest(HoverRequest.type, {
          textDocument: { uri },
          position: { line: 1, character: 6 },
        });
        const contents = found?.contents as { value: string } | undefined;
        return contents?.value;
      };
      expect([await hints(), await hovered()]).toEqual([
        [[{ line: 1, character: 13 }, "◐ PenEvidence 1 of 2 states drawn", true]],
        "◐ PenEvidence 1 of 2 states drawn\n\nMissing:\n- Button: style = plain",
      ]);

      // The drawing changed: once the editor hears, its evidence is stale.
      writeFileSync(drawing, "filled, redrawn\n");
      await editor.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [{ uri: pathToFileURL(drawing).href, type: FileChangeType.Changed }],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect([refreshed.length > 0, await hints(), await hovered()]).toEqual([
        true,
        [[{ line: 1, character: 13 }, "◌ PenEvidence 0 of 2 states drawn, 1 stale", true]],
        "◌ PenEvidence 0 of 2 states drawn, 1 stale\n\nMissing:\n- Button: style = plain\n\nStale:\n- Button: style = filled",
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("counts the stored records without problems, and says which problems keep the others from counting", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-uncounted-"));
    try {
      const text =
        "enum Style = primary | secondary\ntype Button {\n  state style: Style\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      writeFileSync(join(folder, "design.txt"), "drawn\n");
      const fingerprint = createHash("sha1").update("blob 6\0drawn\n").digest("hex");
      mkdirSync(join(folder, "pen-evidence"));
      // Evidence recorded before style's values were edited by hand.
      const entry = (style: string) =>
        `  {\n    "context": { "type": "Button", "dimensions": {}, "states": { "style": "${style}" } },\n    "actor": "DesignAgent",\n    "source": { "file": "design.txt", "frame": "f", "fingerprint": "${fingerprint}" }\n  }`;
      writeFileSync(
        join(folder, "pen-evidence", "button.json"),
        `[\n${entry("filled")},\n${entry("plain")},\n${entry("filled")},\n${entry("primary")}\n]\n`,
      );
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      const hints = await editor.sendRequest(InlayHintRequest.type, {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 8, character: 0 } },
      });
      const found = await editor.sendRequest(HoverRequest.type, {
        textDocument: { uri },
        position: { line: 1, character: 6 },
      });
      expect([
        hints?.map(({ position, label }) => [position, label]),
        (found?.contents as { value: string } | undefined)?.value,
      ]).toEqual([
        [
          [
            { line: 1, character: 13 },
            "◌ PenEvidence 1 of 2 states drawn · 3 of 4 records have problems, 2 still say style = filled, which Style no longer has (primary, secondary)",
          ],
        ],
        [
          "◌ PenEvidence 1 of 2 states drawn · 3 of 4 records have problems, 2 still say style = filled, which Style no longer has (primary, secondary)",
          "",
          "Missing:",
          "- Button: style = secondary",
          "",
          "Not counted until their problems are fixed:",
          "",
          "- pen-evidence/button.json:3:75: $[0].context.states.style: `filled` is not a value of `style` (`primary`, `secondary`)",
          "- pen-evidence/button.json:8:75: $[1].context.states.style: `plain` is not a value of `style` (`primary`, `secondary`)",
          "- pen-evidence/button.json:13:75: $[2].context.states.style: `filled` is not a value of `style` (`primary`, `secondary`)",
        ].join("\n"),
      ]);

      // All of them alike: the hint says so of all of them.
      writeFileSync(
        join(folder, "pen-evidence", "button.json"),
        `[\n${entry("plain")},\n${entry("primary")}\n]\n`,
      );
      await editor.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [
          {
            uri: pathToFileURL(join(folder, "pen-evidence", "button.json")).href,
            type: FileChangeType.Changed,
          },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const again = await editor.sendRequest(InlayHintRequest.type, {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 8, character: 0 } },
      });
      expect(again?.map(({ label }) => label)).toEqual([
        "◌ PenEvidence 1 of 2 states drawn · 1 of 2 records still says style = plain, which Style no longer has (primary, secondary)",
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("counts stored records made before a state was added as outdated, with the state that was, and still says what one taken away leaves", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-reworded-"));
    try {
      const text =
        "enum Style = primary | secondary\nenum Hover = rest | hovered\ntype Button {\n  state style: Style, hover: Hover\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      mkdirSync(join(folder, "pen-evidence"));
      // The drawing they point at, as it was recorded.
      writeFileSync(join(folder, "design.txt"), "drawn\n");
      const fingerprint = createHash("sha1").update("blob 6\0drawn\n").digest("hex");
      const stored = join(folder, "pen-evidence", "button.json");
      const entry = (states: string) =>
        `{ "context": { "type": "Button", "dimensions": {}, "states": ${states} }, "actor": "DesignAgent", "source": { "file": "design.txt", "frame": "f", "fingerprint": "${fingerprint}" } }`;
      // Two recorded before Button had hover, and one since.
      writeFileSync(
        stored,
        `[${entry('{ "style": "primary" }')}, ${entry('{ "style": "secondary" }')}, ${entry('{ "style": "secondary", "hover": "rest" }')}]`,
      );
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      const label = async () =>
        (
          await editor.sendRequest(InlayHintRequest.type, {
            textDocument: { uri },
            range: { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } },
          })
        )?.map(({ label }) => label);
      const before = await label();
      const found = await editor.sendRequest(HoverRequest.type, {
        textDocument: { uri },
        position: { line: 2, character: 6 },
      });
      const details = (found?.contents as { value: string } | undefined)?.value;
      // A state the model no longer has, on one record.
      writeFileSync(
        stored,
        `[${entry('{ "style": "primary", "hover": "rest", "press": "released" }')}, ${entry('{ "style": "secondary", "hover": "rest" }')}]`,
      );
      await editor.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [{ uri: pathToFileURL(stored).href, type: FileChangeType.Changed }],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect([before, details, await label()]).toEqual([
        ["◌ PenEvidence 1 of 4 states drawn · 2 outdated: hover added"],
        [
          "◌ PenEvidence 1 of 4 states drawn · 2 outdated: hover added",
          "",
          "2 records are outdated: hover was added to Button after they were recorded, so they do not say which hover they show. Add each one's hover value to count it again.",
          "",
          "Outdated:",
          "- style = primary",
          "- style = secondary",
          "",
          "Missing:",
          "- Button: style = primary, hover = rest",
          "- Button: style = primary, hover = hovered",
          "- Button: style = secondary, hover = hovered",
        ].join("\n"),
        [
          "◌ PenEvidence 1 of 4 states drawn · 1 of 2 records still says press, a state Button no longer has",
        ],
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it("counts a component's records for it on its own, and for it where another type places it", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-apart-"));
    try {
      const text =
        "enum Style = plain | bold\ntype Button {\n  state style: Style\n}\ntype Tab {\n  state style: Style\n}\ntype Bar {\n  has tab: Tab\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      writeFileSync(join(folder, "design.txt"), "drawn\n");
      const fingerprint = createHash("sha1").update("blob 6\0drawn\n").digest("hex");
      const entry = (path: string) =>
        `{ "context": { "path": "${path}", "dimensions": {}, "parents": {}, "states": { "style": "plain" } }, "actor": "DesignAgent", "source": { "file": "design.txt", "frame": "f", "fingerprint": "${fingerprint}" } }`;
      mkdirSync(join(folder, "pen-evidence"));
      writeFileSync(join(folder, "pen-evidence", "button.json"), `[${entry("Button")}]`);
      // Tab, recorded on its own, which Bar places.
      writeFileSync(join(folder, "pen-evidence", "tab.json"), `[${entry("Tab")}]`);
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      const hints = await editor.sendRequest(InlayHintRequest.type, {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 14, character: 0 } },
      });
      // Bar's tab is a usage of the Tab component: no hint, but over the
      // component's name its declaration and its evidence there; over the
      // child's name, no evidence.
      const hovered = async (character: number) =>
        (
          (
            await editor.sendRequest(HoverRequest.type, {
              textDocument: { uri },
              position: { line: 8, character },
            })
          )?.contents as { value: string } | undefined
        )?.value;
      expect([
        hints?.map(({ position, label }) => [position.line, label]),
        await hovered(12),
        await hovered(7),
      ]).toEqual([
        [
          [1, "◐ PenEvidence 1 of 2 states drawn"],
          [4, "◐ PenEvidence 1 of 2 states drawn"],
          [7, "○ PenEvidence 0 of 1 state drawn"],
        ],
        "```dxn\ntype Tab\n  state style: Style\n```\n\n---\n\n◐ PenEvidence: Bar can show all 2 states of Tab, 1 drawn\n\nMissing:\n- Bar.tab: style = bold",
        undefined,
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("marks each hint by how much has evidence: all of it, some or none", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-marks-"));
    try {
      const text =
        "enum Style = plain | bold\ntype Back {\n  state style: Style\n}\ntype Bar {\n  has back: Back\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      writeFileSync(join(folder, "design.txt"), "drawn\n");
      const fingerprint = createHash("sha1").update("blob 6\0drawn\n").digest("hex");
      const entry = (style: string) =>
        `{ "context": { "path": "Back", "dimensions": {}, "parents": {}, "states": { "style": "${style}" } }, "actor": "DesignAgent", "source": { "file": "design.txt", "frame": "f", "fingerprint": "${fingerprint}" } }`;
      mkdirSync(join(folder, "pen-evidence"));
      writeFileSync(
        join(folder, "pen-evidence", "back.json"),
        `[${entry("plain")}, ${entry("bold")}]`,
      );
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      const hints = await editor.sendRequest(InlayHintRequest.type, {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 14, character: 0 } },
      });
      expect(hints?.map(({ position, label }) => [position.line, label])).toEqual([
        [1, "● PenEvidence 2 of 2 states drawn"],
        [4, "○ PenEvidence 0 of 1 state drawn"],
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("says, over a component placed in a type, whether all its states there are drawn, and what the type pins", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-usage-"));
    try {
      const text =
        "enum Kind = root | pushed\ntype Bar {\n  state kind: Kind\n}\ntype Screen {\n  has bar: Bar { kind = root }\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      writeFileSync(join(folder, "design.txt"), "drawn\n");
      const fingerprint = createHash("sha1").update("blob 6\0drawn\n").digest("hex");
      const entry = (kind: string) =>
        `{ "context": { "path": "Bar", "dimensions": {}, "parents": {}, "states": { "kind": "${kind}" } }, "actor": "DesignAgent", "source": { "file": "design.txt", "frame": "f", "fingerprint": "${fingerprint}" } }`;
      mkdirSync(join(folder, "pen-evidence"));
      writeFileSync(join(folder, "pen-evidence", "bar.json"), `[${entry("root")}]`);
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const opened = published(editor);
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await opened;
      const found = await editor.sendRequest(HoverRequest.type, {
        textDocument: { uri },
        position: { line: 5, character: 12 },
      });
      // Bar on its own has two states, one drawn; the screen pins the one.
      expect((found?.contents as { value: string } | undefined)?.value.split("---\n\n")[1]).toBe(
        "● PenEvidence: Screen shows 1 state of Bar, kind = root, drawn",
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("shows a drawing that the model disagrees with at the child it is about, and counts it apart", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dxn-mismatch-"));
    try {
      const text =
        "type Row {}\ntype Screen {\n  has row: Row\n}\nrecord PenEvidence {\n  source: PenNode\n}\nactor DesignAgent records PenEvidence\n";
      writeFileSync(join(folder, "spec.dxn"), text);
      const design = {
        children: [
          { id: "row", type: "frame", name: "Row", reusable: true, children: [] },
          {
            id: "screen",
            type: "frame",
            children: [
              { id: "a", type: "ref", ref: "row" },
              { id: "b", type: "ref", ref: "row" },
            ],
          },
        ],
      };
      writeFileSync(join(folder, "design.pen"), JSON.stringify(design));
      const fingerprint = new Fingerprints().of(join(folder, "design.pen"), "screen");
      mkdirSync(join(folder, "pen-evidence"));
      writeFileSync(
        join(folder, "pen-evidence", "screen.json"),
        `[{ "context": { "type": "Screen", "dimensions": {}, "states": {} }, "actor": "DesignAgent", "source": { "file": "design.pen", "frame": "screen", "fingerprint": "${fingerprint}" } }]`,
      );
      const uri = pathToFileURL(join(folder, "spec.dxn")).href;
      const editor = connect();
      editors.push(editor);
      await editor.sendRequest(InitializeRequest.type, {
        processId: null,
        rootUri: null,
        capabilities: {},
      });
      const all = new Map<string, PublishDiagnosticsParams["diagnostics"]>();
      editor.onNotification(PublishDiagnosticsNotification.type, ({ uri: at, diagnostics }) => {
        all.set(at, diagnostics);
      });
      await editor.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "dxn", version: 1, text },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const hints = await editor.sendRequest(InlayHintRequest.type, {
        textDocument: { uri },
        range: { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } },
      });
      expect([
        all.get(uri)?.map(({ range, message, severity }) => [range, severity, message]),
        hints?.map(({ position, label }) => [position.line, label]),
      ]).toEqual([
        [
          [
            { start: { line: 2, character: 6 }, end: { line: 2, character: 9 } },
            1,
            "`Screen`: the drawing shows 2 `Row` instances, but `row` is a single `Row`; make it a list, `[Row]`, or draw one, in pen-evidence/screen.json:1",
          ],
        ],
        [
          [0, "○ PenEvidence 0 of 1 state drawn"],
          [1, "◌ PenEvidence 1 of 1 state drawn, 1 doesn't match the model"],
        ],
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
