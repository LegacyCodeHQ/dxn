import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type CompletionKind,
  completions,
  definition,
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
  ErrorCodes,
  type Range,
  ResponseError,
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
  connection.onInitialize(({ capabilities }) => {
    links = capabilities.textDocument?.definition?.linkSupport === true;
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
  connection.onPrepareRename(({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (document === undefined) return null;
    const found = renameable(document.getText(), position.line + 1, position.character + 1);
    if ("refusal" in found) throw new ResponseError(ErrorCodes.InvalidRequest, found.refusal);
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
    if ("refusal" in renamed) throw new ResponseError(ErrorCodes.InvalidRequest, renamed.refusal);
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
    return { changes };
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
