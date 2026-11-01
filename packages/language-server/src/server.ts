import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type CompletionKind,
  completions,
  definition,
  type Edit,
  folderOf,
  hover,
  parse,
  renameAt,
  renameable,
  type StoredFile,
  storedFiles,
  usages,
} from "@legacycodehq/dxn-language";
import {
  CompletionItemKind,
  type Connection,
  MessageType,
  type Range,
  ShowMessageNotification,
  TextDocumentSyncKind,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { diagnose } from "./diagnostics.js";
import { rangeAt } from "./range.js";

// Serves dxn to an editor over a connection: the problems in each open file,
// published when it opens and whenever it changes, and cleared when it closes;
// where a name in it is declared, and where it is used; what it is; what fits
// where the cursor is; and renaming a name, in the file and in the stored
// records beside it.
export function serve(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  // Whether the editor takes a link, which names the text it goes from, so
  // that it underlines a whole name, hyphens and all, rather than its words.
  let links = false;
  // Whether the editor can move a folder, as renaming a record moves its
  // stored records'.
  let moves = false;
  connection.onInitialize(({ capabilities }) => {
    links = capabilities.textDocument?.definition?.linkSupport === true;
    const edits = capabilities.workspace?.workspaceEdit;
    moves =
      edits?.documentChanges === true && edits.resourceOperations?.includes("rename") === true;
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
        renameProvider: { prepareProvider: true },
        // Typing a name asks on its own; a dot starts the next part of a path.
        completionProvider: { triggerCharacters: ["."] },
      },
    };
  });
  documents.onDidChangeContent(({ document }) => {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: diagnose(document.getText()) });
  });
  documents.onDidClose(({ document }) => {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
  });
  connection.onDefinition(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const text = document.getText();
    const found = definition(text, position.line + 1, position.character + 1);
    if (found === undefined) return null;
    const target = rangeAt(text, found.to.line, found.to.column);
    if (!links) return { uri: textDocument.uri, range: target };
    const { line, column, length } = found.from;
    return [
      {
        originSelectionRange: {
          start: { line: line - 1, character: column - 1 },
          end: { line: line - 1, character: column - 1 + length },
        },
        targetUri: textDocument.uri,
        targetRange: target,
        targetSelectionRange: target,
      },
    ];
  });
  connection.onReferences(({ textDocument, position, context }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = usages(document.getText(), position.line + 1, position.character + 1);
    if (found === undefined) return null;
    const spans = context.includeDeclaration ? [found.declaration, ...found.usages] : found.usages;
    return spans.map(({ line, column, length }) => ({
      uri: textDocument.uri,
      range: {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column - 1 + length },
      },
    }));
  });
  connection.onHover(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = hover(document.getText(), position.line + 1, position.character + 1);
    if (found === undefined) return null;
    const { line, column, length } = found.from;
    const comment = found.comment === undefined ? "" : `\n\n${found.comment}`;
    return {
      contents: { kind: "markdown", value: `\`\`\`dxn\n${found.code}\n\`\`\`${comment}` },
      range: {
        start: { line: line - 1, character: column - 1 },
        end: { line: line - 1, character: column - 1 + length },
      },
    };
  });
  // Why a rename cannot be done, as a message: an editor shows a message,
  // where it may only log a request that failed. Nothing is renamed.
  const refuse = (reason: string) => {
    connection.sendNotification(ShowMessageNotification.type, {
      type: MessageType.Error,
      message: reason,
    });
    return null;
  };
  connection.onPrepareRename(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = renameable(document.getText(), position.line + 1, position.character + 1);
    if ("refusal" in found) return refuse(found.refusal);
    return { range: rangeOf(found.from), placeholder: found.name };
  });
  connection.onRenameRequest(({ textDocument, position, newName }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const text = document.getText();
    const renamed = renameAt(
      text,
      position.line + 1,
      position.character + 1,
      newName,
      storedBeside(textDocument.uri, text),
    );
    if ("refusal" in renamed) return refuse(renamed.refusal);
    const changes: Record<string, { range: Range; newText: string }[]> = {
      [textDocument.uri]: renamed.edits.map(({ line, column, length, text: newText }) => ({
        range: rangeOf({ line, column, length }),
        newText,
      })),
    };
    // A stored file is replaced whole, keeping its layout but for the values.
    for (const data of renamed.data) {
      const before = readFileSync(data.path, "utf8").split("\n");
      changes[pathToFileURL(data.path).href] = [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: before.length - 1, character: (before.at(-1) ?? "").length },
          },
          newText: data.source,
        },
      ];
    }
    // A record's stored records move to the folder named after its new name.
    const { folder } = renamed;
    const directory = textDocument.uri.startsWith("file:")
      ? dirname(fileURLToPath(textDocument.uri))
      : undefined;
    if (folder === undefined || folder.from === folder.to || directory === undefined) {
      return { changes };
    }
    const from = join(directory, folder.from);
    const to = join(directory, folder.to);
    if (!isFolder(from)) return { changes };
    const record =
      renamed.edits.length > 0 ? document.getText(rangeOf(renamed.edits[0] as Edit)) : "";
    if (existsSync(to)) {
      return refuse(
        `${folder.to}/ is already next to the file; ${record}'s stored records cannot move there`,
      );
    }
    if (!moves) {
      return refuse(
        `the editor cannot move ${folder.from}/, where ${record}'s stored records are, to ${folder.to}/`,
      );
    }
    return {
      documentChanges: [
        {
          textDocument: { uri: textDocument.uri, version: document.version },
          edits: changes[textDocument.uri] ?? [],
        },
        {
          kind: "rename" as const,
          oldUri: pathToFileURL(from).href,
          newUri: pathToFileURL(to).href,
        },
      ],
    };
  });
  connection.onCompletion(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    return completions(document.getText(), position.line + 1, position.character + 1).map(
      ({ label, kind }) => ({ label, kind: kinds[kind], detail: kind }),
    );
  });
  documents.listen(connection);
  connection.listen();
}

// How an editor shows each kind of suggestion.
const kinds: Record<CompletionKind, CompletionItemKind> = {
  keyword: CompletionItemKind.Keyword,
  enum: CompletionItemKind.Enum,
  dimension: CompletionItemKind.Unit,
  type: CompletionItemKind.Class,
  record: CompletionItemKind.Struct,
  scalar: CompletionItemKind.TypeParameter,
  environment: CompletionItemKind.Module,
  profile: CompletionItemKind.Constant,
  value: CompletionItemKind.EnumMember,
  state: CompletionItemKind.Field,
  event: CompletionItemKind.Event,
  action: CompletionItemKind.Method,
  child: CompletionItemKind.Property,
};

// The range of a span, both from one, as an editor's, from zero.
function rangeOf({
  line,
  column,
  length,
}: {
  line: number;
  column: number;
  length: number;
}): Range {
  return {
    start: { line: line - 1, character: column - 1 },
    end: { line: line - 1, character: column - 1 + length },
  };
}

// The stored records of a file's records, by convention: the JSON files in each
// record's folder, next to the file. None for a file that is not on disk.
function storedBeside(uri: string, text: string): StoredFile[] {
  if (!uri.startsWith("file:")) return [];
  const directory = dirname(fileURLToPath(uri));
  const records = [...new Set(parse(text).records.map(({ name }) => name))];
  return records.flatMap((record) =>
    (storedFiles(directory, record) ?? []).map((name) => {
      const path = join(directory, folderOf(record), name);
      return { record, path, source: readFileSync(path, "utf8") };
    }),
  );
}

// Whether a path is a folder.
const isFolder = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
